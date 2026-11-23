package views

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestPixelIconPreservesGeneratedShadowsInRenderedHTML(t *testing.T) {
	for _, name := range []string{"snake", "ski"} {
		t.Run(name, func(t *testing.T) {
			var output bytes.Buffer
			if err := PixelIcon(name).Render(context.Background(), &output); err != nil {
				t.Fatal(err)
			}
			html := output.String()
			assertContains(t, html, `data-pixel-icon="`+name+`"`)
			assertContains(t, html, `--pixel-columns:12;`)
			assertContains(t, html, `--pixel-rows:12;`)
			assertContains(t, html, `var(--pixel-size)`)
			if strings.Contains(html, "zTempl") {
				t.Fatal("template sanitization replaced the generated CSS")
			}
			pixels := strings.Count(strings.Join(pixelIconPatterns[name], ""), "#")
			if shadows := strings.Count(html, "currentColor"); shadows != pixels {
				t.Errorf("rendered %d shadows for %d filled pixels", shadows, pixels)
			}
		})
	}
}
