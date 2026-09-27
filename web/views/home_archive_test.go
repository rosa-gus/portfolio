package views

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"portfolio/internal/portfolio"
)

func TestHomeRendersProjectArchive(t *testing.T) {
	t.Parallel()

	project := portfolio.Project{
		Slug:          "example-project",
		Index:         "01",
		Title:         "Example Project",
		Capabilities:  []string{"interfaces"},
		FeaturedStack: []string{"TypeScript", "Cloudflare Workers"},
		Media: portfolio.ProjectMedia{
			Cover: "cover",
			Items: []portfolio.ProjectImage{
				{ID: "cover", Src: "/projects/example/cover.png", Width: 1200, Height: 800},
				{ID: "detail", Src: "/projects/example/detail.png", Width: 900, Height: 600},
			},
		},
	}

	var output bytes.Buffer
	if err := Home(portfolio.ProfileContent{}, []portfolio.Project{project}, "/portfolio", "https://example.com").Render(context.Background(), &output); err != nil {
		t.Fatalf("Home().Render() returned error: %v", err)
	}

	html := output.String()
	assertContains(t, html, `data-archive-folder="interfaces"`)
	assertContains(t, html, `data-archive-case="example-project"`)
	assertContains(t, html, `src="/portfolio/projects/covers/example-project.webp"`)
	assertContains(t, html, `loading="eager" decoding="async"`)
	assertContains(t, html, `href="/portfolio/case/example-project"`)
	assertContains(t, html, `data-archive-files="interfaces"`)
	assertContains(t, html, `data-archive-file="example-project"`)
	if got, want := strings.Count(html, "data-archive-file=\"example-project\""), 1; got != want {
		t.Errorf("archive file references = %d, want %d", got, want)
	}
}
