package measure

import (
	"context"
	"sync"
	"time"
)

// Snapshot is the latest measured state from a background sampler.
type Snapshot struct {
	Verdict Verdict `json:"verdict"`
	// LagSlots is meaningful only when LagKnown: both endpoints answered the
	// last sample. Otherwise it is 0 and must not be read as "no lag".
	LagSlots int64 `json:"lag_slots"`
	LagKnown bool  `json:"lag_known"`
	// SampledMsAgo is how old the last sample is at the moment Current() is
	// called -- computed from SampledAt on every read, so it ages.
	SampledMsAgo   int64     `json:"sampled_ms_ago"`
	SampledAt      time.Time `json:"-"`
	HasSample      bool      `json:"has_sample"`
	TargetSlot     uint64    `json:"target_slot"`
	RefSlot        uint64    `json:"ref_slot"`
	TargetAdvanced bool      `json:"target_advanced"`
	// RefBehind is copied from the last sample, and only when that sample
	// is paired. It is meaningless when LagKnown is false; /health prints
	// null in that case, the same way it refuses to print a lag of 0.
	RefBehind bool `json:"ref_behind"`
	Measured  bool `json:"measured"`
	// Degraded: the verdict is STALE, proven by paired samples, while other
	// samples in the window went unanswered.
	Degraded bool `json:"degraded"`
}

type sampleRecord struct {
	Sample
	AnyTimeout bool
}

// Sampler continuously samples slot lag in the background.
type Sampler struct {
	cfg Config

	mu       sync.RWMutex
	snapshot Snapshot
	stop     context.CancelFunc
}

func NewSampler(targetURL, refURL string, maxLag int64) *Sampler {
	cfg := DefaultConfig(targetURL, refURL)
	cfg.MaxLag = maxLag
	return &Sampler{cfg: cfg}
}

func (s *Sampler) Start(ctx context.Context) {
	runCtx, cancel := context.WithCancel(ctx)
	s.stop = cancel

	go func() {
		ticker := time.NewTicker(SampleInterval)
		defer ticker.Stop()

		var history []sampleRecord
		for {
			select {
			case <-runCtx.Done():
				return
			case <-ticker.C:
				record := s.collectSample(runCtx)
				history = append(history, record)
				if len(history) > 32 {
					history = history[len(history)-32:]
				}

				s.mu.Lock()
				s.snapshot = snapshotFromHistory(history, s.cfg.MaxLag)
				s.mu.Unlock()
			}
		}
	}()
}

func (s *Sampler) Stop() {
	if s.stop != nil {
		s.stop()
	}
}

// Current returns the latest snapshot. Before the first sample there is no
// reading at all, so the verdict is UNKNOWN rather than an empty string next
// to a lag of 0 that reads like a perfect score.
func (s *Sampler) Current() Snapshot {
	s.mu.RLock()
	snap := s.snapshot
	s.mu.RUnlock()
	return snap.at(time.Now())
}

func (snap Snapshot) at(now time.Time) Snapshot {
	if !snap.HasSample {
		snap.Verdict = VerdictUnknown
		return snap
	}
	snap.SampledMsAgo = now.Sub(snap.SampledAt).Milliseconds()
	if !snap.Measured && snap.Verdict == VerdictFresh {
		snap.Verdict = VerdictUnknown
	}
	return snap
}

// collectSample takes one sample the same way Run does: both endpoints are
// asked together (see askBoth) and the pair is folded into a Sample. The
// record also remembers whether either call hit its deadline, since the
// verdict treats a timeout differently from any other failure.
func (s *Sampler) collectSample(ctx context.Context) sampleRecord {
	at := time.Now()
	target, ref := askBoth(ctx, s.cfg)
	rec := sampleRecord{Sample: pairSample(at, target, ref)}
	rec.AnyTimeout = target.timedOut() || ref.timedOut()
	return rec
}

// snapshotFromHistory is the reading Start publishes after each sample.
// RefBehind comes from the last record, and only when that record is
// paired. An unpaired record has no slots to compare, so the flag stays
// false.
func snapshotFromHistory(history []sampleRecord, maxLag int64) Snapshot {
	record := history[len(history)-1]
	result := resultFromHistory(history)
	verdict := ComputeVerdict(result, maxLag)
	result.Verdict = verdict
	measured := len(result.Samples) >= MinSamples &&
		result.RefAnswered &&
		result.TargetAnswered &&
		!result.AnyTimeout
	paired := record.TargetOK && record.RefOK

	snap := Snapshot{
		Verdict:        verdict,
		LagSlots:       result.LastLagSlots,
		LagKnown:       paired,
		SampledAt:      record.At,
		HasSample:      true,
		TargetSlot:     result.LastTargetSlot,
		RefSlot:        result.LastRefSlot,
		TargetAdvanced: result.TargetAdvanced,
		Measured:       measured,
		Degraded:       isDegraded(result),
	}
	if paired {
		snap.RefBehind = record.RefBehind
	}
	if !measured && snap.Verdict == VerdictFresh {
		snap.Verdict = VerdictUnknown
	}
	return snap
}

func resultFromHistory(history []sampleRecord) Result {
	samples := make([]Sample, len(history))
	result := Result{Samples: samples}
	for i, record := range history {
		samples[i] = record.Sample
		if record.AnyTimeout {
			result.AnyTimeout = true
		}
		if record.TargetOK {
			result.TargetAnswered = true
		}
		if record.RefOK {
			result.RefAnswered = true
		}
	}
	result.copyLastSample()
	result.TargetAdvanced = targetAdvanced(samples)
	return result
}

func targetAdvanced(samples []Sample) bool {
	var prev uint64
	hasPrev := false
	for _, s := range samples {
		if !s.TargetOK {
			continue
		}
		if hasPrev && s.TargetSlot > prev {
			return true
		}
		prev = s.TargetSlot
		hasPrev = true
	}
	return false
}
