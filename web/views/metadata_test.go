package views

import (
	"bytes"
	"context"
	"testing"

	"portfolio/internal/portfolio"
)

func TestProjectPageRendersSocialMetadata(t *testing.T) {
	t.Parallel()

	profile := testProfile()
	project := portfolio.Project{
		Slug:    "example-project",
		Title:   "Example Project",
		Summary: "A complete digital experience.",
	}
	var output bytes.Buffer
	if err := ProjectPage(profile, project, "/portfolio", "https://rosa-gus.github.io/portfolio").Render(context.Background(), &output); err != nil {
		t.Fatalf("ProjectPage().Render() returned an error: %v", err)
	}

	html := output.String()
	assertContains(t, html, `<link rel="canonical" href="https://rosa-gus.github.io/portfolio/case/example-project">`)
	assertContains(t, html, `<link rel="manifest" href="/portfolio/manifest.json">`)
	assertContains(t, html, `<link rel="icon" type="image/png" sizes="32x32" media="(prefers-color-scheme: dark)" data-theme-icon="dark" href="/portfolio/favicon/dark/favicon-32x32.png">`)
	assertContains(t, html, `<link rel="icon" type="image/png" sizes="32x32" media="(prefers-color-scheme: light)" data-theme-icon="light" href="/portfolio/favicon/favicon-32x32.png">`)
	assertContains(t, html, `<link rel="apple-touch-icon" sizes="180x180" href="/portfolio/favicon/apple-touch-icon-180x180.png">`)
	assertContains(t, html, `<meta name="color-scheme" content="light dark">`)
	assertContains(t, html, `data-theme-toggle`)
	assertContains(t, html, `<meta property="og:title" content="Example Project — Example Person · Portfolio">`)
	assertContains(t, html, `<meta property="og:image" content="https://rosa-gus.github.io/portfolio/og-image.png">`)
	assertContains(t, html, `<meta name="twitter:card" content="summary_large_image">`)
}

func TestProjectMetadata(t *testing.T) {
	t.Parallel()

	profile := testProfile()
	project := portfolio.Project{
		Slug:    "example project",
		Title:   "Example Project",
		Summary: "A complete digital experience.",
	}

	if got, want := projectMetadataTitle(profile, project), "Example Project — Example Person · Portfolio"; got != want {
		t.Errorf("projectMetadataTitle() = %q, want %q", got, want)
	}
	if got, want := projectMetadataDescription(profile, project), "A complete digital experience. Projeto de Example Person, Software Developer."; got != want {
		t.Errorf("projectMetadataDescription() = %q, want %q", got, want)
	}
	if got, want := publicProjectURL("https://rosa-gus.github.io/portfolio", project.Slug), "https://rosa-gus.github.io/portfolio/case/example%20project"; got != want {
		t.Errorf("publicProjectURL() = %q, want %q", got, want)
	}
}

func TestProjectMetadataDescriptionFallback(t *testing.T) {
	t.Parallel()

	profile := testProfile()
	project := portfolio.Project{Title: "Project without a summary"}
	if got, want := projectMetadataDescription(profile, project), "Project without a summary. Projeto de Example Person, Software Developer."; got != want {
		t.Errorf("projectMetadataDescription() = %q, want %q", got, want)
	}
}

func testProfile() portfolio.ProfileContent {
	return portfolio.ProfileContent{
		Identity: portfolio.ProfileIdentity{
			Name:              "Example Person",
			ProfessionalTitle: "Software Developer",
		},
		SEO: portfolio.ProfileSEO{Title: "Example Person · Portfolio"},
	}
}
