package measure_test

import (
	"testing"

	"github.com/Alarm2024/stale/internal/measure"
)

// A reference that never moves cannot vouch for the target. The lag against
// it is a number without a witness, so the verdict is UNKNOWN, not FRESH.
func TestStuckReferenceYieldsUnknown(t *testing.T) {
	refSrv := newSlotServer(&slotServer{frozen: true, increment: true})
	defer refSrv.Close()
	targetSrv := newSlotServer(&slotServer{increment: true})
	defer targetSrv.Close()

	got := runCheck(t, targetSrv.URL, refSrv.URL, 5)
	if got.Verdict != measure.VerdictUnknown {
		t.Fatalf("verdict = %q, want UNKNOWN (stuck reference is not a witness)", got.Verdict)
	}
}
