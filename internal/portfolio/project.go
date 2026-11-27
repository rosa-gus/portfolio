package portfolio

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"strings"
	"unicode/utf8"
)

var hexColorPattern = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)
var projectSectionIDPattern = regexp.MustCompile(`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`)

type Project struct {
	Slug             string            `json:"slug"`
	Index            string            `json:"index"`
	Title            string            `json:"title"`
	Category         string            `json:"category"`
	Year             string            `json:"year"`
	Status           string            `json:"status"`
	BriefDescription string            `json:"briefDescription"`
	Summary          string            `json:"summary"`
	Role             string            `json:"role"`
	Stack            []string          `json:"stack"`
	FeaturedStack    []string          `json:"featuredStack"`
	Capabilities     []string          `json:"capabilities"`
	PracticeMap      []PracticeBranch  `json:"practiceMap"`
	License          ProjectLicense    `json:"license"`
	CaseStudy        ProjectCaseStudy  `json:"caseStudy"`
	Media            ProjectMedia      `json:"media"`
	Links            ProjectLinks      `json:"links"`
	Featured         bool              `json:"featured"`
	Tone             string            `json:"tone"`
	Relations        []ProjectRelation `json:"relations,omitempty"`
}

type ProjectRelation struct {
	Ref   string `json:"ref"`
	Label string `json:"label"`
}

type PracticeBranch struct {
	Capability   string   `json:"capability"`
	Technologies []string `json:"technologies"`
}

type ProjectLicense struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type ProjectMedia struct {
	Cover       string             `json:"cover"`
	Preview     string             `json:"preview,omitempty"`
	CoverCredit ProjectCoverCredit `json:"coverCredit"`
	Items       []ProjectImage     `json:"items"`
}

type ProjectCoverCredit struct {
	Name      string `json:"name"`
	AuthorURL string `json:"author_url"`
}

type ProjectImage struct {
	ID      string `json:"id"`
	Src     string `json:"src"`
	Width   int    `json:"-"`
	Height  int    `json:"-"`
	Alt     string `json:"alt"`
	Label   string `json:"label"`
	Caption string `json:"caption"`
	Note    string `json:"note,omitempty"`
}

type ProjectCaseStudy struct {
	Sections []ProjectCaseSection `json:"sections"`
}

type ProjectCaseSection struct {
	ID      string           `json:"id"`
	Title   string           `json:"title"`
	Content MarkdownDocument `json:"content"`
}

// MarkdownDocument keeps authored Markdown independent from its HTML rendering.
// Path identifies the embedded source, while Source contains its loaded contents.
type MarkdownDocument struct {
	Path   string `json:"-"`
	Source string `json:"-"`
}

func (document *MarkdownDocument) UnmarshalJSON(data []byte) error {
	return json.Unmarshal(data, &document.Path)
}

type ProjectLinks struct {
	CaseStudy  string `json:"caseStudy"`
	Repository string `json:"repository"`
	Releases   string `json:"releases"`
	Live       string `json:"live"`
}

//go:embed data/profile.json data/projects.json data/cases data/documents.json data/documents data/archive.json data/apps.json
var contentFiles embed.FS

//go:embed data/image-dimensions.json
var imageDimensionsJSON []byte

var imageDimensions = mustLoadImageDimensions()

func mustLoadImageDimensions() map[string]struct{ Width, Height int } {
	var dimensions map[string]struct{ Width, Height int }
	if err := json.Unmarshal(imageDimensionsJSON, &dimensions); err != nil {
		panic(fmt.Errorf("load generated image dimensions: %w", err))
	}
	return dimensions
}

// ProjectImageDimensions returns dimensions extracted from assets during the build.
func ProjectImageDimensions(src string) (width, height int, ok bool) {
	dimensions, ok := imageDimensions[src]
	return dimensions.Width, dimensions.Height, ok
}

var Projects = mustLoadProjects()

func mustLoadProjects() []Project {
	projectsJSON, err := contentFiles.ReadFile("data/projects.json")
	if err != nil {
		panic(fmt.Errorf("read project catalog: %w", err))
	}

	var projects []Project
	if err := json.Unmarshal(projectsJSON, &projects); err != nil {
		panic(fmt.Errorf("load projects: %w", err))
	}
	for index := range projects {
		for imageIndex := range projects[index].Media.Items {
			image := &projects[index].Media.Items[imageIndex]
			width, height, ok := ProjectImageDimensions(image.Src)
			if !ok || width <= 0 || height <= 0 {
				panic(fmt.Errorf("missing dimensions for %q; run npm run assets:build", image.Src))
			}
			image.Width, image.Height = width, height
		}
		if err := validateProjectTone(projects[index].Tone); err != nil {
			panic(fmt.Errorf("load tone for %q: %w", projects[index].Slug, err))
		}
		if err := validateProjectFeaturedStack(projects[index]); err != nil {
			panic(fmt.Errorf("load featuredStack for %q: %w", projects[index].Slug, err))
		}
		if err := validateProjectPracticeMap(projects[index]); err != nil {
			panic(fmt.Errorf("load practiceMap for %q: %w", projects[index].Slug, err))
		}
		if err := validateProjectLicense(projects[index].License); err != nil {
			panic(fmt.Errorf("load license for %q: %w", projects[index].Slug, err))
		}
		if err := loadCaseStudy(&projects[index]); err != nil {
			panic(err)
		}
	}
	if err := validateProjectRelations(projects); err != nil {
		panic(err)
	}
	return projects
}

func validateProjectLicense(license ProjectLicense) error {
	name := strings.TrimSpace(license.Name)
	licenseURL := strings.TrimSpace(license.URL)
	if (name == "") != (licenseURL == "") {
		return fmt.Errorf("name and URL must be provided together")
	}
	return nil
}

func validateProjectPracticeMap(project Project) error {
	if len(project.PracticeMap) != len(project.Capabilities) {
		return fmt.Errorf("must contain one branch for each capability")
	}

	capabilities := make(map[string]bool, len(project.Capabilities))
	for _, capability := range project.Capabilities {
		capabilities[capability] = true
	}
	stack := make(map[string]bool, len(project.Stack))
	for _, technology := range project.Stack {
		stack[technology] = true
	}

	seenCapabilities := make(map[string]bool, len(project.PracticeMap))
	seenTechnologies := make(map[string]bool, len(project.Stack))
	for _, branch := range project.PracticeMap {
		if !capabilities[branch.Capability] {
			return fmt.Errorf("capability %q is not present in capabilities", branch.Capability)
		}
		if seenCapabilities[branch.Capability] {
			return fmt.Errorf("capability %q is duplicated", branch.Capability)
		}
		if len(branch.Technologies) == 0 {
			return fmt.Errorf("capability %q has no technologies", branch.Capability)
		}
		seenCapabilities[branch.Capability] = true

		seenInBranch := make(map[string]bool, len(branch.Technologies))
		for _, technology := range branch.Technologies {
			if !stack[technology] {
				return fmt.Errorf("technology %q is not present in stack", technology)
			}
			if seenInBranch[technology] {
				return fmt.Errorf("technology %q is duplicated in %q", technology, branch.Capability)
			}
			seenInBranch[technology] = true
			seenTechnologies[technology] = true
		}
	}

	for _, technology := range project.Stack {
		if !seenTechnologies[technology] {
			return fmt.Errorf("technology %q is not assigned to a capability", technology)
		}
	}

	return nil
}

func validateProjectFeaturedStack(project Project) error {
	if len(project.FeaturedStack) != 2 {
		return fmt.Errorf("must contain exactly two technologies")
	}

	stack := make(map[string]bool, len(project.Stack))
	for _, technology := range project.Stack {
		stack[technology] = true
	}

	seen := make(map[string]bool, len(project.FeaturedStack))
	for _, technology := range project.FeaturedStack {
		if strings.TrimSpace(technology) == "" {
			return fmt.Errorf("must not contain an empty technology")
		}
		if !stack[technology] {
			return fmt.Errorf("%q is not present in stack", technology)
		}
		if seen[technology] {
			return fmt.Errorf("%q is duplicated", technology)
		}
		seen[technology] = true
	}

	return nil
}

func validateProjectTone(tone string) error {
	if !hexColorPattern.MatchString(tone) {
		return fmt.Errorf("%q must use the #RRGGBB hexadecimal format", tone)
	}
	return nil
}

func loadCaseStudy(project *Project) error {
	seenIDs := make(map[string]bool, len(project.CaseStudy.Sections))
	for index := range project.CaseStudy.Sections {
		section := &project.CaseStudy.Sections[index]
		if err := validateProjectCaseSection(*section, seenIDs); err != nil {
			return fmt.Errorf("load section %d for %q: %w", index+1, project.Slug, err)
		}
		if err := loadMarkdownDocument(project.Slug, section.ID, &section.Content); err != nil {
			return fmt.Errorf("load section %q for %q: %w", section.ID, project.Slug, err)
		}
		seenIDs[section.ID] = true
	}
	return nil
}

func validateProjectCaseSection(section ProjectCaseSection, seenIDs map[string]bool) error {
	if !projectSectionIDPattern.MatchString(section.ID) {
		return fmt.Errorf("section ID %q must use lowercase kebab-case", section.ID)
	}
	if section.ID == "gallery" || section.ID == "practice" || strings.HasSuffix(section.ID, "-heading") {
		return fmt.Errorf("section ID %q is reserved", section.ID)
	}
	if seenIDs[section.ID] {
		return fmt.Errorf("duplicate section ID %q", section.ID)
	}
	if strings.TrimSpace(section.Title) == "" {
		return fmt.Errorf("section %q requires a title", section.ID)
	}
	return nil
}

func loadMarkdownDocument(slug, section string, document *MarkdownDocument) error {
	expectedDirectory := path.Join("cases", slug) + "/"
	if !fs.ValidPath(document.Path) ||
		!strings.HasPrefix(document.Path, expectedDirectory) ||
		path.Base(document.Path) != section+".md" {
		return fmt.Errorf("invalid Markdown path: %q", document.Path)
	}

	contents, err := contentFiles.ReadFile(path.Join("data", document.Path))
	if err != nil {
		return fmt.Errorf("read %q: %w", document.Path, err)
	}
	if !utf8.Valid(contents) {
		return fmt.Errorf("%q does not contain valid UTF-8", document.Path)
	}
	source := string(contents)
	if strings.TrimSpace(source) == "" {
		return fmt.Errorf("%q is empty", document.Path)
	}

	document.Source = source
	return nil
}

func FindProject(slug string) (Project, bool) {
	if slug == "" {
		return Project{}, false
	}
	for _, project := range Projects {
		if project.Slug == slug {
			return project, true
		}
	}
	return Project{}, false
}
