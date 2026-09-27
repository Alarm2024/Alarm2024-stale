package serve

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Alarm2024/stale/internal/measure"
)

// slotServer answers every getSlot with the given slot, echoing the request id.
func slotServer(slot uint64) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID json.RawMessage `json:"id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": req.ID, "result": slot})
	}))
}

// healthOnceSampled starts the sampler, waits until ready(snapshot) holds,
// and returns the /health body as raw JSON fields.
func healthOnceSampled(t *testing.T, s *Server, ready func(measure.Snapshot) bool) map[string]json.RawMessage {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	t.Cleanup(cancel)
	s.sampler.Start(ctx)
	t.Cleanup(s.sampler.Stop)

	deadline := time.Now().Add(6 * time.Second)
	for {
		snap := s.sampler.Current()
		if ready(snap) {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("sampler never reached the expected state: %+v", snap)
		}
		time.Sleep(15 * time.Millisecond)
	}

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	var out map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

// An unpaired last sample has no comparison to report. /health must say
// ref_behind: null, the same way it says lag_slots: null — a false would
// read as "the reference is not behind".
func TestHealthRefBehindNullWhenLastSampleUnpaired(t *testing.T) {
	down := func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}
	upstream := httptest.NewServer(http.HandlerFunc(down))
	defer upstream.Close()
	ref := httptest.NewServer(http.HandlerFunc(down))
	defer ref.Close()

	s, err := New(Options{Upstream: upstream.URL, RefURL: ref.URL})
	if err != nil {
		t.Fatal(err)
	}
	out := healthOnceSampled(t, s, func(snap measure.Snapshot) bool {
		return snap.HasSample && !snap.LagKnown
	})
	if string(out["ref_behind"]) != "null" {
		t.Fatalf("unpaired last sample: /health ref_behind = %s, want null", out["ref_behind"])
	}
	if string(out["lag_slots"]) != "null" {
		t.Fatalf("unpaired last sample: /health lag_slots = %s, want null", out["lag_slots"])
	}
}

// Both endpoints answer, and the reference reads 100 slots below the target.
// The lag floors to 0, so ref_behind: true is the only thing on /health that
// says the 0 is not a target keeping pace.
func TestHealthRefBehindTrueWhenPairedSampleHasRefBelowTarget(t *testing.T) {
	upstream := slotServer(1000)
	defer upstream.Close()
	ref := slotServer(900)
	defer ref.Close()

	s, err := New(Options{Upstream: upstream.URL, RefURL: ref.URL})
	if err != nil {
		t.Fatal(err)
	}
	out := healthOnceSampled(t, s, func(snap measure.Snapshot) bool {
		return snap.HasSample && snap.LagKnown
	})
	if string(out["ref_behind"]) != "true" {
		t.Fatalf("paired sample with ref 900 < target 1000: /health ref_behind = %s, want true", out["ref_behind"])
	}
	if string(out["lag_slots"]) != "0" {
		t.Fatalf("paired sample with ref below target: /health lag_slots = %s, want 0", out["lag_slots"])
	}
}
