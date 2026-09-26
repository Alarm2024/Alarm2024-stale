package measure

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestTrailingReferenceIsFlaggedOnSampleAndResult(t *testing.T) {
	const (
		target = "http://target.test"
		ref    = "http://ref.test"
	)
	var n atomic.Int64
	res, err := Run(context.Background(), Config{
		TargetURL: target,
		RefURL:    ref,
		MaxLag:    5,
		For:       60 * time.Millisecond,
		Sleep:     func(context.Context, time.Duration) error { return nil },
		GetSlot: func(_ context.Context, endpoint string) (uint64, error) {
			switch endpoint {
			case target:
				return uint64(1000 + n.Add(1)%2), nil
			case ref:
				return 900, nil
			default:
				t.Errorf("unexpected endpoint %q", endpoint)
				return 0, context.DeadlineExceeded
			}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Samples) == 0 {
		t.Fatal("no samples")
	}
	last := res.Samples[len(res.Samples)-1]
	if !last.RefBehind {
		t.Fatal("ref 100 slots below target: Sample.RefBehind is false")
	}
	if last.LagSlots != 0 {
		t.Fatalf("LagSlots = %d, want 0", last.LagSlots)
	}
	if !res.LastRefBehind {
		t.Fatal("Result.LastRefBehind did not copy the last sample")
	}
	if got := FormatSampleLine(last); !strings.Contains(got, "ref_behind=yes") {
		t.Fatalf("printed line missing trailing-reference tag: %q", got)
	}
}

func TestLeadingReferenceDoesNotPrintTrailingTag(t *testing.T) {
	s := pairSample(time.Time{}, slotAnswer{slot: 100}, slotAnswer{slot: 105})
	if s.RefBehind {
		t.Fatal("ref 5 slots ahead: RefBehind is true")
	}
	if s.LagSlots != 5 {
		t.Fatalf("LagSlots = %d, want 5", s.LagSlots)
	}
	if got := FormatSampleLine(s); strings.Contains(got, "ref_behind") {
		t.Fatalf("printed line grew a trailing-reference tag: %q", got)
	}
}
