package measure

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// getSlot is called once per endpoint per sample. The fake only answers
// when the other call is already waiting. Overlapping calls close the
// gate immediately. Sequential calls leave the first one waiting until
// giveUp, which the test treats as failure.
func TestGetSlotCallsOverlap(t *testing.T) {
	const giveUp = 2 * time.Second

	var (
		n         atomic.Int32
		solo      atomic.Bool
		gate      = make(chan struct{})
		closeOnce sync.Once
	)
	get := func(context.Context, string) (uint64, error) {
		if n.Add(1) == 2 {
			closeOnce.Do(func() { close(gate) })
		}
		timer := time.NewTimer(giveUp)
		defer timer.Stop()
		select {
		case <-gate:
			return 1000, nil
		case <-timer.C:
			solo.Store(true)
			return 0, context.DeadlineExceeded
		}
	}

	finished := make(chan error, 1)
	go func() {
		_, err := Run(context.Background(), Config{
			TargetURL: "http://target.test",
			RefURL:    "http://ref.test",
			MaxLag:    5,
			For:       20 * time.Millisecond,
			Sleep:     func(context.Context, time.Duration) error { return nil },
			GetSlot:   get,
		})
		finished <- err
	}()

	select {
	case err := <-finished:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(giveUp + time.Second):
		t.Fatal("Run did not return")
	}
	if solo.Load() {
		t.Fatal("a getSlot call waited alone: target and reference are not asked together")
	}
}
