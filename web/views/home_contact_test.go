package views

import (
	"bytes"
	"context"
	"testing"

	"portfolio/internal/portfolio"
)

func TestHomeOmitsContactEditionMark(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	if err := Home(portfolio.ProfileContent{}, nil, "", "https://example.com").Render(context.Background(), &output); err != nil {
		t.Fatalf("Home().Render() returned error: %v", err)
	}

	html := output.String()
	assertNotContains(t, html, `contact-panel__edition-mark`)
	assertNotContains(t, html, `<span>L</span><span>U I S</span><span>G U S T A</span>`)
}

func TestHomeRendersSourceRepositoryLink(t *testing.T) {
	t.Parallel()

	profile := portfolio.ProfileContent{
		Contact: portfolio.ContactDetails{
			SourceURL: "https://github.com/example/portfolio",
		},
	}

	var output bytes.Buffer
	if err := Home(profile, nil, "", "https://example.com").Render(context.Background(), &output); err != nil {
		t.Fatalf("Home().Render() returned error: %v", err)
	}

	assertContains(t, output.String(), `<a href="https://github.com/example/portfolio" target="_blank" rel="noreferrer">Código-fonte ↗︎</a>`)
}
