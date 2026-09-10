package views

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"portfolio/internal/portfolio"
	"portfolio/web"
)

func TestPagesRenderManifestAssetsWithBasePath(t *testing.T) {
	t.Parallel()

	profile := testProfile()
	project := portfolio.Project{
		Slug:  "example-project",
		Title: "Example Project",
	}
	pages := map[string]struct {
		render func(*bytes.Buffer) error
	}{
		"home": {
			render: func(output *bytes.Buffer) error {
				return Home(profile, []portfolio.Project{project}, "/portfolio", "https://example.com/portfolio").Render(context.Background(), output)
			},
		},
		"project": {
			render: func(output *bytes.Buffer) error {
				return ProjectPage(profile, project, "/portfolio", "https://example.com/portfolio").Render(context.Background(), output)
			},
		},
	}

	assets := web.Assets()
	for name, page := range pages {
		t.Run(name, func(t *testing.T) {
			var output bytes.Buffer
			if err := page.render(&output); err != nil {
				t.Fatalf("render returned an error: %v", err)
			}

			html := output.String()
			assertContains(t, html, `src="/portfolio/`+strings.TrimPrefix(assets.Script, "/")+`"`)
			for _, stylesheet := range assets.Stylesheets {
				assertContains(t, html, `href="/portfolio/`+strings.TrimPrefix(stylesheet, "/")+`"`)
			}
			if strings.Contains(html, `/assets/app.js`) || strings.Contains(html, `/assets/app.css`) {
				t.Error("render still contains an unhashed application asset URL")
			}
		})
	}
}
