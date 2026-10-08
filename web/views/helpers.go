package views

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"unicode"

	"github.com/a-h/templ"
	"portfolio/internal/portfolio"
	"portfolio/internal/sitepath"
	"portfolio/web"
)

func sectionHeadingClass(primary bool) string {
	if primary {
		return "section-heading section-heading--primary"
	}
	return "section-heading section-heading--information"
}

func projectCover(project portfolio.Project) portfolio.ProjectImage {
	for _, image := range project.Media.Items {
		if image.ID == project.Media.Cover {
			image.Src = "/projects/covers/" + url.PathEscape(project.Slug) + ".webp"
			image.Width = 1200
			image.Height = 800
			return image
		}
	}
	return portfolio.ProjectImage{}
}

func projectArchiveImages(project portfolio.Project) []portfolio.ProjectImage {
	images := make([]portfolio.ProjectImage, 0, 3)
	cover := projectCover(project)
	if cover.Src == "" && len(project.Media.Items) > 0 {
		cover = project.Media.Items[0]
	}
	if cover.Src != "" {
		images = append(images, cover)
	}

	for _, image := range project.Media.Items {
		if image.ID == cover.ID || image.Src == "" {
			continue
		}
		images = append(images, image)
		if len(images) == 3 {
			break
		}
	}

	return images
}

func featuredTechnologyLabel(technology string) string {
	labels := map[string]string{
		"Cloudflare Workers": "Workers",
		"TypeScript":         "TS",
	}
	if label, ok := labels[technology]; ok {
		return label
	}
	return technology
}

func imageDimension(value int) string {
	return strconv.Itoa(value)
}

func projectToneStyle(tone string) map[string]string {
	if len(tone) != 7 || tone[0] != '#' {
		return nil
	}
	if _, err := strconv.ParseUint(tone[1:], 16, 24); err != nil {
		return nil
	}

	return map[string]string{
		"--project-tone": tone,
	}
}

func projectFolioID(project portfolio.Project) string {
	identifier := strings.TrimSpace(project.Slug)
	if identifier == "" {
		identifier = strings.Join(strings.Fields(project.Title), "-")
	}
	identifier = strings.NewReplacer("-", "_", " ", "_").Replace(identifier)
	return strings.ToUpper(identifier)
}

func projectFolioGlyphRows(project portfolio.Project) []string {
	return folioGlyphRows(projectFolioID(project))
}

func folioGlyphRows(identifier string) []string {
	const fallback = "CASE"
	rowLengths := [...]int{1, 3, 5, 7, 5, 3, 1}

	glyphs := []rune(strings.Map(func(character rune) rune {
		if unicode.IsLetter(character) || unicode.IsDigit(character) {
			return character
		}
		return -1
	}, identifier))
	if len(glyphs) == 0 {
		glyphs = []rune(fallback)
	}

	rows := make([]string, 0, len(rowLengths))
	position := 0
	for _, rowLength := range rowLengths {
		characters := make([]string, rowLength)
		for index := range characters {
			characters[index] = string(glyphs[position%len(glyphs)])
			position++
		}
		rows = append(rows, strings.Join(characters, " "))
	}
	return rows
}

func projectFolioMeta(project portfolio.Project) string {
	parts := make([]string, 0, 2)
	if category := strings.TrimSpace(projectCategoryLabel(project.Category)); category != "" {
		parts = append(parts, category)
	}
	if status := strings.TrimSpace(projectStatusLabel(project.Status)); status != "" {
		parts = append(parts, status)
	}
	return strings.ToUpper(strings.Join(parts, " / "))
}

func archiveImageLoading(initial bool) string {
	if initial {
		return "eager"
	}
	return "lazy"
}

func galleryCounter(index, total int) string {
	return fmt.Sprintf("%02d / %02d", index+1, total)
}

func galleryCaptionID(projectSlug, imageID string) string {
	return "project-" + projectSlug + "-gallery-" + imageID + "-caption"
}

func galleryNoteID(projectSlug, imageID string) string {
	return "project-" + projectSlug + "-gallery-" + imageID + "-note"
}

func galleryDescriptionIDs(projectSlug, imageID string, hasNote bool) string {
	captionID := galleryCaptionID(projectSlug, imageID)
	if hasNote {
		return captionID + " " + galleryNoteID(projectSlug, imageID)
	}
	return captionID
}

func galleryMediaClass(hasNote bool) string {
	if hasNote {
		return "project-gallery__media project-gallery__media--noted"
	}
	return "project-gallery__media"
}

func galleryImageClass(image portfolio.ProjectImage) string {
	if projectImageIsPortrait(image) {
		return "project-gallery__image project-gallery__image--portrait"
	}
	return "project-gallery__image"
}

func projectImageIsPortrait(image portfolio.ProjectImage) bool {
	return image.Height > image.Width
}

func archiveImageClass(image portfolio.ProjectImage) string {
	if projectImageIsPortrait(image) {
		return "project-archive__case-cover-image project-archive__case-cover-image--portrait"
	}
	return "project-archive__case-cover-image"
}

func isProjectAvailable(project portfolio.Project) bool {
	return project.Slug != "" && project.Title != ""
}

func availableProjects(projects []portfolio.Project) []portfolio.Project {
	available := make([]portfolio.Project, 0, len(projects))
	for _, project := range projects {
		if isProjectAvailable(project) {
			available = append(available, project)
		}
	}
	return available
}

type archiveFolder struct {
	Key      string
	Label    string
	Projects []portfolio.Project
}

func archiveFolders(projects []portfolio.Project) []archiveFolder {
	folders := []archiveFolder{
		{Key: "interfaces", Label: "Interfaces"},
		{Key: "systems", Label: "Sistemas & APIs"},
		{Key: "data", Label: "Dados & IA"},
		{Key: "design", Label: "Design Systems"},
	}
	capabilityFolder := map[string]int{
		"interfaces":          0,
		"systems-and-apis":    1,
		"data-and-automation": 2,
		"design-systems":      3,
	}
	other := archiveFolder{Key: "other", Label: "Outros"}
	for _, project := range availableProjects(projects) {
		assigned := false
		for _, capability := range project.Capabilities {
			if folderIndex, ok := capabilityFolder[capability]; ok {
				folders[folderIndex].Projects = append(folders[folderIndex].Projects, project)
				assigned = true
			}
		}
		if !assigned {
			other.Projects = append(other.Projects, project)
		}
	}
	if len(other.Projects) > 0 {
		folders = append(folders, other)
	}
	return folders
}

func siteURL(basePath, target string) templ.SafeURL {
	return templ.URL(sitepath.Resolve(basePath, target))
}

func appStylesheets() []string {
	return web.Assets().Stylesheets
}

func appScript() string {
	return web.Assets().Script
}

func projectURL(basePath, slug string) templ.SafeURL {
	return siteURL(basePath, "/case/"+url.PathEscape(slug))
}

func publicProjectURL(publicURL, slug string) string {
	return publicURL + "/case/" + url.PathEscape(slug)
}

func socialImageURL(publicURL string) string {
	return publicURL + "/og-image.png"
}

func siteMetadataTitle(profile portfolio.ProfileContent) string {
	return profile.SEO.Title
}

func projectMetadataTitle(profile portfolio.ProfileContent, project portfolio.Project) string {
	return project.Title + " — " + siteMetadataTitle(profile)
}

func projectMetadataDescription(profile portfolio.ProfileContent, project portfolio.Project) string {
	description := strings.TrimSpace(project.Summary)
	if description == "" {
		description = strings.TrimSpace(project.BriefDescription)
	}
	if description == "" {
		description = project.Title + "."
	} else if !strings.ContainsAny(description[len(description)-1:], ".!?") {
		description += "."
	}
	return description + " Projeto de " + profile.Identity.Name + ", " + profile.Identity.ProfessionalTitle + "."
}

func externalURL(rawURL string) templ.SafeURL {
	return templ.URL(rawURL)
}

func repositoryLabel(rawURL string) string {
	label := strings.TrimSpace(rawURL)
	label = strings.TrimPrefix(label, "https://")
	label = strings.TrimPrefix(label, "http://")
	return strings.TrimSuffix(label, "/")
}

func emailURL(email string) templ.SafeURL {
	return templ.URL("mailto:" + url.PathEscape(email))
}

func projectStatusLabel(status string) string {
	labels := map[string]string{
		"production":  "Em produção",
		"in-progress": "Em desenvolvimento",
		"archived":    "Arquivado",
		"concept":     "Conceito",
	}
	if label, ok := labels[status]; ok {
		return label
	}
	return status
}

func projectCategoryLabel(category string) string {
	labels := map[string]string{
		"Social impact platform": "Plataforma de impacto social",
	}
	if label, ok := labels[category]; ok {
		return label
	}
	return category
}

func projectRoleLabel(role string) string {
	labels := map[string]string{
		"Volunteer full-stack development":                  "Desenvolvimento full-stack voluntário",
		"Volunteer design system and front-end development": "Design system e desenvolvimento front-end voluntário",
	}
	if label, ok := labels[role]; ok {
		return label
	}
	return role
}

func capabilityLabel(capability string) string {
	labels := map[string]string{
		"accessibility":       "Acessibilidade",
		"interfaces":          "Interfaces",
		"systems-and-apis":    "Sistemas e APIs",
		"data-and-automation": "Dados e automação",
		"design-systems":      "Design systems",
		"security":            "Segurança",
	}
	if label, ok := labels[capability]; ok {
		return label
	}
	return capability
}

func projectEvidence(projects []portfolio.Project, slugs []string) []portfolio.Project {
	evidence := make([]portfolio.Project, 0, len(slugs))
	for _, slug := range slugs {
		for _, project := range projects {
			if project.Slug == slug {
				evidence = append(evidence, project)
				break
			}
		}
	}
	return evidence
}

func careerEntryRange(total int) string {
	if total <= 0 {
		return "00"
	}
	return fmt.Sprintf("01—%02d", total)
}

func careerCapabilities(projects []portfolio.Project) []string {
	seen := make(map[string]bool)
	capabilities := make([]string, 0)
	for _, project := range projects {
		for _, capability := range project.Capabilities {
			if seen[capability] {
				continue
			}
			seen[capability] = true
			capabilities = append(capabilities, capabilityLabel(capability))
		}
	}
	return capabilities
}
