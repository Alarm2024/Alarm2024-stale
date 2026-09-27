package check

import (
	"strings"
	"testing"

	"github.com/Alarm2024/stale/internal/measure"
)

func TestVerdictLinePrintsUnknownLagForUnpairedFinalSample(t *testing.T) {
	r := measure.Result{
		Verdict:  measure.VerdictStale,
		Degraded: true,
		Samples: []measure.Sample{
			{TargetOK: true, RefOK: true, TargetSlot: 1000, RefSlot: 1100, LagSlots: 100},
			{TargetOK: true, RefOK: true, TargetSlot: 1000, RefSlot: 1101, LagSlots: 101},
			{RefOK: true, RefSlot: 1102},
		},
		LastRefSlot: 1102,
	}
	line := VerdictLine(r)
	for _, want := range []string{"verdict=STALE", "lag=unknown", "degraded=true"} {
		if !strings.Contains(line, want) {
			t.Fatalf("line %q missing %q", line, want)
		}
	}
	if strings.Contains(line, "lag=0") {
		t.Fatalf("line %q prints a placeholder lag", line)
	}
}

// An unpaired final sample has no reference-versus-target comparison, so
// ref_behind is unknown, not the false a zero Result would print.
func TestVerdictLinePrintsUnknownRefBehindForUnpairedFinalSample(t *testing.T) {
	r := measure.Result{
		Verdict: measure.VerdictUnknown,
		Samples: []measure.Sample{
			{TargetOK: true, RefOK: true, TargetSlot: 1000, RefSlot: 900, RefBehind: true},
			{TargetOK: true, TargetSlot: 1001},
		},
		LastTargetSlot: 1001,
	}
	line := VerdictLine(r)
	if !strings.Contains(line, "ref_behind=unknown") {
		t.Fatalf("line %q: want ref_behind=unknown for an unpaired final sample", line)
	}

	r.Samples = append(r.Samples, measure.Sample{TargetOK: true, RefOK: true, TargetSlot: 1002, RefSlot: 950, RefBehind: true})
	r.LastRefBehind = true
	if line := VerdictLine(r); !strings.Contains(line, "ref_behind=true") {
		t.Fatalf("line %q: want ref_behind=true for a paired final sample with ref below target", line)
	}
}

func TestVerdictLinePrintsMeasuredLag(t *testing.T) {
	r := measure.Result{
		Verdict:      measure.VerdictStale,
		Samples:      []measure.Sample{{TargetOK: true, RefOK: true, LagSlots: 28, LagMs: 11200}},
		LastLagSlots: 28,
		LastLagMs:    11200,
	}
	line := VerdictLine(r)
	if !strings.Contains(line, "lag=28 slots (11200 ms)") || !strings.Contains(line, "degraded=false") {
		t.Fatalf("unexpected line %q", line)
	}
}
