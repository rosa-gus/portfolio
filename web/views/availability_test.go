package views

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestHomeAvailabilityVisibility(t *testing.T) {
	for _, visible := range []bool{true, false} {
		name := "hidden"
		if visible {
			name = "visible"
		}
		t.Run(name, func(t *testing.T) {
			profile := testProfile()
			profile.Introduction.ShowAvailability = visible
			profile.Introduction.Availability = "Disponível para novas oportunidades"
			var output bytes.Buffer
			if err := Home(profile, nil, "", "https://example.com").Render(context.Background(), &output); err != nil {
				t.Fatal(err)
			}
			html := output.String()
			if got := strings.Contains(html, profile.Introduction.Availability); got != visible {
				t.Errorf("availability present = %v, want %v", got, visible)
			}
			panelTitle := ""
			if visible {
				panelTitle = profile.Introduction.Availability
			}
			assertContains(t, html, `data-panel-title="`+panelTitle+`"`)
		})
	}
}
