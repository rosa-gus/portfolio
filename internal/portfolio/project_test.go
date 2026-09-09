package portfolio

import (
	"strings"
	"testing"
)

func TestEmbeddedCaseStudiesAreLoaded(t *testing.T) {
	t.Parallel()

	project, ok := FindProject("coleoptera-identifier")
	if !ok {
		t.Fatal("Coleoptera Identifier was not loaded")
	}
	if project.CaseStudy.Context.Path != "cases/coleoptera-identifier/context.md" {
		t.Fatalf("context path = %q", project.CaseStudy.Context.Path)
	}
	if !strings.Contains(project.CaseStudy.Context.Source, "*Alien*") {
		t.Fatal("context Markdown content was not loaded")
	}
}

func TestLoadMarkdownDocumentRejectsInvalidPaths(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		path string
	}{
		{name: "different project", path: "cases/jaci-ui/context.md"},
		{name: "wrong section", path: "cases/coleoptera-identifier/result.md"},
		{name: "wrong extension", path: "cases/coleoptera-identifier/context.txt"},
		{name: "path traversal", path: "cases/coleoptera-identifier/../context.md"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			document := MarkdownDocument{Path: test.path}
			if err := loadMarkdownDocument("coleoptera-identifier", "context", &document); err == nil {
				t.Fatalf("loadMarkdownDocument(%q) returned no error", test.path)
			}
		})
	}
}

func TestEmptyMarkdownReferenceIsAllowed(t *testing.T) {
	t.Parallel()

	document := MarkdownDocument{}
	if err := loadMarkdownDocument("mondo-send", "context", &document); err != nil {
		t.Fatalf("empty reference returned an error: %v", err)
	}
}

func TestProjectTonesUseHexColors(t *testing.T) {
	t.Parallel()

	for _, project := range Projects {
		if err := validateProjectTone(project.Tone); err != nil {
			t.Errorf("invalid tone for %q: %v", project.Slug, err)
		}
	}
}

func TestValidateProjectTone(t *testing.T) {
	t.Parallel()

	for _, tone := range []string{"", "white", "#FFF", "F2F9F9", "#GGGGGG", "#F2F9F9FF"} {
		if err := validateProjectTone(tone); err == nil {
			t.Errorf("validateProjectTone(%q) should return an error", tone)
		}
	}

	for _, tone := range []string{"#F2F9F9", "#000000", "#0a0a09"} {
		if err := validateProjectTone(tone); err != nil {
			t.Errorf("validateProjectTone(%q) returned an error: %v", tone, err)
		}
	}
}

func TestValidateProjectFeaturedStack(t *testing.T) {
	t.Parallel()

	valid := Project{
		Stack:         []string{"TypeScript", "Cloudflare Workers", "React"},
		FeaturedStack: []string{"TypeScript", "Cloudflare Workers"},
	}
	if err := validateProjectFeaturedStack(valid); err != nil {
		t.Fatalf("valid featured stack returned an error: %v", err)
	}

	tests := []struct {
		name          string
		featuredStack []string
	}{
		{name: "missing technology", featuredStack: []string{"TypeScript"}},
		{name: "too many technologies", featuredStack: []string{"TypeScript", "Cloudflare Workers", "React"}},
		{name: "technology outside stack", featuredStack: []string{"TypeScript", "Go"}},
		{name: "duplicate technology", featuredStack: []string{"TypeScript", "TypeScript"}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			project := valid
			project.FeaturedStack = test.featuredStack
			if err := validateProjectFeaturedStack(project); err == nil {
				t.Fatal("invalid featured stack returned no error")
			}
		})
	}
}

func TestValidateProjectPracticeMap(t *testing.T) {
	t.Parallel()

	valid := Project{
		Stack:        []string{"Go", "Bubble Tea", "FastAPI"},
		Capabilities: []string{"interfaces", "systems-and-apis"},
		PracticeMap: []PracticeBranch{
			{Capability: "interfaces", Technologies: []string{"Go", "Bubble Tea"}},
			{Capability: "systems-and-apis", Technologies: []string{"Go", "FastAPI"}},
		},
	}
	if err := validateProjectPracticeMap(valid); err != nil {
		t.Fatalf("valid practice map returned an error: %v", err)
	}

	tests := []struct {
		name        string
		practiceMap []PracticeBranch
	}{
		{
			name: "missing capability branch",
			practiceMap: []PracticeBranch{
				{Capability: "interfaces", Technologies: []string{"Go", "Bubble Tea", "FastAPI"}},
			},
		},
		{
			name: "unknown capability",
			practiceMap: []PracticeBranch{
				{Capability: "interfaces", Technologies: []string{"Go", "Bubble Tea"}},
				{Capability: "security", Technologies: []string{"FastAPI"}},
			},
		},
		{
			name: "duplicate capability",
			practiceMap: []PracticeBranch{
				{Capability: "interfaces", Technologies: []string{"Go", "Bubble Tea"}},
				{Capability: "interfaces", Technologies: []string{"FastAPI"}},
			},
		},
		{
			name: "empty technology branch",
			practiceMap: []PracticeBranch{
				{Capability: "interfaces", Technologies: []string{"Go", "Bubble Tea", "FastAPI"}},
				{Capability: "systems-and-apis"},
			},
		},
		{
			name: "technology outside stack",
			practiceMap: []PracticeBranch{
				{Capability: "interfaces", Technologies: []string{"Go", "Bubble Tea"}},
				{Capability: "systems-and-apis", Technologies: []string{"Python", "FastAPI"}},
			},
		},
		{
			name: "duplicate technology within branch",
			practiceMap: []PracticeBranch{
				{Capability: "interfaces", Technologies: []string{"Go", "Go", "Bubble Tea"}},
				{Capability: "systems-and-apis", Technologies: []string{"FastAPI"}},
			},
		},
		{
			name: "unassigned technology",
			practiceMap: []PracticeBranch{
				{Capability: "interfaces", Technologies: []string{"Go"}},
				{Capability: "systems-and-apis", Technologies: []string{"FastAPI"}},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			project := valid
			project.PracticeMap = test.practiceMap
			if err := validateProjectPracticeMap(project); err == nil {
				t.Fatal("invalid practice map returned no error")
			}
		})
	}
}

func TestValidateProjectLicense(t *testing.T) {
	t.Parallel()

	if err := validateProjectLicense(ProjectLicense{Name: "GPL-3.0", URL: "https://www.gnu.org/licenses/gpl-3.0.html"}); err != nil {
		t.Fatalf("valid license returned an error: %v", err)
	}
	if err := validateProjectLicense(ProjectLicense{}); err != nil {
		t.Fatalf("empty license returned an error: %v", err)
	}

	for _, license := range []ProjectLicense{
		{Name: "GPL-3.0"},
		{URL: "https://www.gnu.org/licenses/gpl-3.0.html"},
	} {
		if err := validateProjectLicense(license); err == nil {
			t.Fatal("incomplete license returned no error")
		}
	}
}
