package views

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"portfolio/internal/portfolio"
)

func TestProjectToneStyleDefinesProjectAccent(t *testing.T) {
	t.Parallel()

	for _, tone := range []string{"#F2F9F9", "#0A0A09", "#7e9331"} {
		t.Run(tone, func(t *testing.T) {
			t.Parallel()

			style := projectToneStyle(tone)
			if got := style["--project-tone"]; got != tone {
				t.Errorf("--project-tone = %q, want %q", got, tone)
			}
			if len(style) != 1 {
				t.Errorf("projectToneStyle() = %#v, want only --project-tone", style)
			}
		})
	}
}

func TestProjectToneStyleRejectsInvalidColor(t *testing.T) {
	t.Parallel()

	if style := projectToneStyle("graphite"); style != nil {
		t.Errorf("projectToneStyle() = %#v, want nil", style)
	}
}

func TestProjectContentAppliesToneInline(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	project := portfolio.Project{Tone: "#F2F9F9"}
	if err := ProjectContent(project, "").Render(context.Background(), &output); err != nil {
		t.Fatalf("ProjectContent().Render() returned an error: %v", err)
	}

	assertContains(t, output.String(), `class="project-content project-content--page" style="--project-tone:#F2F9F9;"`)
}

func TestProjectFolioContent(t *testing.T) {
	t.Parallel()

	project := portfolio.Project{
		Slug:     "coleoptera-identifier",
		Title:    "Coleoptera Identifier",
		Category: "Applied AI research",
		Status:   "prototype",
	}

	if got, want := projectFolioID(project), "COLEOPTERA_IDENTIFIER"; got != want {
		t.Errorf("projectFolioID() = %q, want %q", got, want)
	}
	if got, want := projectFolioMeta(project), "APPLIED AI RESEARCH / PROTOTYPE"; got != want {
		t.Errorf("projectFolioMeta() = %q, want %q", got, want)
	}
}

func TestProjectFolioGlyphRowsRepeatShortIdentifiers(t *testing.T) {
	t.Parallel()

	project := portfolio.Project{Slug: "jaci-ui", Title: "Jaci UI"}
	want := []string{
		"J",
		"A C I",
		"U I J A C",
		"I U I J A C I",
		"U I J A C",
		"I U I",
		"J",
	}

	got := projectFolioGlyphRows(project)
	if len(got) != len(want) {
		t.Fatalf("projectFolioGlyphRows() returned %d rows, want %d", len(got), len(want))
	}
	for index := range want {
		if got[index] != want[index] {
			t.Errorf("projectFolioGlyphRows()[%d] = %q, want %q", index, got[index], want[index])
		}
	}
}

func TestProjectContentRendersContinuousNoteAndTechnicalDetails(t *testing.T) {
	t.Parallel()

	project := portfolio.Project{
		Slug:         "coleoptera-identifier",
		Title:        "Coleoptera Identifier",
		Summary:      "An editorial project summary.",
		Role:         "Applied research and full-stack development",
		Capabilities: []string{"interfaces", "security"},
		Stack:        []string{"Go", "Python"},
		PracticeMap: []portfolio.PracticeBranch{
			{Capability: "interfaces", Technologies: []string{"Go"}},
			{Capability: "security", Technologies: []string{"Python"}},
		},
		CaseStudy: portfolio.ProjectCaseStudy{
			Context:   portfolio.MarkdownDocument{Source: "Context body."},
			Challenge: portfolio.MarkdownDocument{Source: "Challenge body."},
			Decision:  portfolio.MarkdownDocument{Source: "Decision body."},
			Result:    portfolio.MarkdownDocument{Source: "Result body."},
		},
		Media: portfolio.ProjectMedia{Items: []portfolio.ProjectImage{
			{ID: "screen", Src: "/projects/screen.png", Alt: "Project screen", Label: "Interface"},
		}},
		License: portfolio.ProjectLicense{
			Name: "GPL-3.0",
			URL:  "https://www.gnu.org/licenses/gpl-3.0.html",
		},
		Links: portfolio.ProjectLinks{
			Repository: "https://github.com/example/coleoptera-identifier",
			Releases:   "https://github.com/example/coleoptera-identifier/releases",
		},
	}

	var output bytes.Buffer
	if err := ProjectContent(project, "").Render(context.Background(), &output); err != nil {
		t.Fatalf("ProjectContent().Render() returned an error: %v", err)
	}

	html := output.String()
	assertContains(t, html, `class="project-content__standfirst">An editorial project summary.</p>`)
	assertContains(t, html, `href="#project-coleoptera-identifier-practice"`)
	assertContains(t, html, `class="project-note__facts"`)
	assertNotContains(t, html, `role="tab`)
	assertNotContains(t, html, ` hidden`)
	assertNotContains(t, html, `practice-map__tree`)
	previous := -1
	for _, section := range []string{"context", "challenge", "decision", "result", "gallery", "practice"} {
		position := strings.Index(html, `data-project-section="`+section+`"`)
		if position <= previous {
			t.Fatalf("section %q is missing or out of reading order", section)
		}
		previous = position
		assertContains(t, html, `href="#project-coleoptera-identifier-`+section+`"`)
	}
	for _, body := range []string{"Context body.", "Challenge body.", "Decision body.", "Result body."} {
		assertContains(t, html, body)
	}
	assertContains(t, html, `data-project-gallery`)
	assertContains(t, html, `data-gallery-expand`)
	assertContains(t, html, `src="/projects/screen.png"`)
	assertContains(t, html, `Applied research and full-stack development`)
	assertContains(t, html, `<span>Go</span>`)
	assertContains(t, html, `class="project-note__resources control-text"`)
	assertContains(t, html, `Releases estáveis e experimentais do Coleoptera Identifier`)
	assertContains(t, html, `https://github.com/example/coleoptera-identifier/releases`)
	assertContains(t, html, `github.com/example/coleoptera-identifier`)
	assertContains(t, html, `GPL-3.0`)
	assertNotContains(t, html, `Mapa de prática`)
	assertNotContains(t, html, `project-content__mobile-metadata`)
	assertNotContains(t, html, `project-content__metadata-row`)
}
