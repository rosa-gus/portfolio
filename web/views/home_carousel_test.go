package views

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"portfolio/internal/portfolio"
)

func TestProjectCarouselImagesStartsWithOptimizedCover(t *testing.T) {
	t.Parallel()

	project := portfolio.Project{
		Slug: "example-project",
		Media: portfolio.ProjectMedia{
			Cover: "cover",
			Items: []portfolio.ProjectImage{
				{ID: "detail", Src: "/projects/example/detail.png"},
				{ID: "cover", Src: "/projects/example/cover.png"},
			},
		},
	}

	images := projectCarouselImages(project)
	if got, want := len(images), 2; got != want {
		t.Fatalf("projectCarouselImages() returned %d images, want %d", got, want)
	}
	if got, want := images[0].Src, "/projects/carousel/example-project.webp"; got != want {
		t.Errorf("first image source = %q, want %q", got, want)
	}
	if got, want := images[1].ID, "detail"; got != want {
		t.Errorf("second image ID = %q, want %q", got, want)
	}
}

func TestProjectCarouselImagesLimitsHomePreview(t *testing.T) {
	t.Parallel()

	project := portfolio.Project{
		Slug: "example-project",
		Media: portfolio.ProjectMedia{
			Cover: "cover",
			Items: []portfolio.ProjectImage{
				{ID: "cover", Src: "/projects/example/cover.png"},
				{ID: "detail-1", Src: "/projects/example/detail-1.png"},
				{ID: "detail-2", Src: "/projects/example/detail-2.png"},
				{ID: "detail-3", Src: "/projects/example/detail-3.png"},
			},
		},
	}

	images := projectCarouselImages(project)
	if got, want := len(images), projectCarouselImageLimit; got != want {
		t.Fatalf("projectCarouselImages() returned %d images, want %d", got, want)
	}
	if got, want := images[2].ID, "detail-2"; got != want {
		t.Errorf("last preview image ID = %q, want %q", got, want)
	}
}

func TestHomeRendersProjectImageSequence(t *testing.T) {
	t.Parallel()

	project := portfolio.Project{
		Slug:          "example-project",
		Index:         "01",
		Title:         "Example Project",
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
	if got, want := strings.Count(html, " data-project-image data-src="), 2; got != want {
		t.Errorf("project image data markers = %d, want %d", got, want)
	}
	assertContains(t, html, `class="project-card__cover is-current" data-project-image`)
	assertContains(t, html, `data-src="/portfolio/projects/carousel/example-project.webp" src="/portfolio/projects/carousel/example-project.webp"`)
	assertContains(t, html, `data-src="/portfolio/projects/example/detail.png"`)
	assertNotContains(t, html, ` src="/portfolio/projects/example/detail.png"`)
	assertContains(t, html, `loading="lazy" decoding="async" aria-hidden="true"`)
	assertContains(t, html, `data-project-index="01"`)
	assertContains(t, html, `class="project-card__previous-tab" type="button" data-carousel-previous-tab aria-label="Projeto anterior" aria-hidden="true" tabindex="-1" disabled hidden`)
	assertContains(t, html, `<span class="project-card__details-stack" aria-label="Tecnologias em destaque"><abbr title="TypeScript">[TS]</abbr><abbr title="Cloudflare Workers">[Workers]</abbr></span>`)
	assertContains(t, html, `<span class="project-card__technology-list" aria-label="Tecnologias em destaque"><abbr title="TypeScript">[TS]</abbr><abbr title="Cloudflare Workers">[Workers]</abbr></span>`)
}
