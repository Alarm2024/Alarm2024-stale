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
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	s.sampler.Start(ctx)
	defer s.sampler.Stop()

	deadline := time.Now().Add(6 * time.Second)
	var snap measure.Snapshot
	for {
		snap = s.sampler.Current()
		if snap.HasSample && !snap.LagKnown {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("sampler never recorded an unpaired sample: %+v", snap)
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
	if string(out["ref_behind"]) != "null" {
		t.Fatalf("unpaired last sample: /health ref_behind = %s, want null", out["ref_behind"])
	}
	if string(out["lag_slots"]) != "null" {
		t.Fatalf("unpaired last sample: /health lag_slots = %s, want null", out["lag_slots"])
	}
}
