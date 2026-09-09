package views

import (
	"bytes"
	"context"
	"testing"

	"portfolio/internal/portfolio"
)

func TestHomeRendersProfileContent(t *testing.T) {
	t.Parallel()

	profile := portfolio.ProfileContent{
		Identity: portfolio.ProfileIdentity{
			DisplayName: "Example Person",
			Profession:  "Example Profession",
		},
		SEO: portfolio.ProfileSEO{Title: "Example Portfolio"},
		About: portfolio.ProfileAbout{
			Heading:    "About the work",
			Paragraphs: []string{"Example biography."},
		},
	}

	var output bytes.Buffer
	if err := Home(profile, nil, "", "https://example.com").Render(context.Background(), &output); err != nil {
		t.Fatalf("Home().Render() returned error: %v", err)
	}

	html := output.String()
	assertContains(t, html, `<title>Example Portfolio</title>`)
	assertContains(t, html, `class="identity__mark-image identity__mark-image--light" src="/favicon/favicon-32x32.png"`)
	assertContains(t, html, `class="identity__mark-image identity__mark-image--dark" src="/favicon/dark/favicon-32x32.png"`)
	assertContains(t, html, `<span>Example Person</span>`)
	assertContains(t, html, `<p>Example biography.</p>`)
}
