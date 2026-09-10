package views

import (
	"bytes"
	"context"
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

func TestProjectContentRendersRelocatedDetails(t *testing.T) {
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
	assertContains(t, html, `data-project-tab="practice"`)
	assertContains(t, html, `class="practice-map__tree"`)
	assertContains(t, html, `Applied research and full-stack development`)
	assertContains(t, html, `<li>[Go]</li>`)
	assertContains(t, html, `class="practice-map__resources"`)
	assertContains(t, html, `class="practice-map__release-link"`)
	assertContains(t, html, `Releases estáveis e experimentais do Coleoptera Identifier`)
	assertContains(t, html, `https://github.com/example/coleoptera-identifier/releases`)
	assertContains(t, html, `class="practice-map__provenance"`)
	assertContains(t, html, `github.com/example/coleoptera-identifier`)
	assertContains(t, html, `GPL-3.0`)
	assertNotContains(t, html, `Mapa de prática`)
	assertNotContains(t, html, `project-content__mobile-metadata`)
	assertNotContains(t, html, `project-content__metadata-row`)
}
