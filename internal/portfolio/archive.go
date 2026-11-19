package portfolio

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"strings"
)

// ArchiveCatalog controls placement independently of published content.
type ArchiveCatalog struct {
	Collections []ArchiveCollectionConfig `json:"collections"`
	Items       []ArchiveItemConfig       `json:"items"`
}

type ArchiveCollectionConfig struct {
	ID            string   `json:"id"`
	Label         string   `json:"label"`
	Symbol        string   `json:"symbol"`
	Capabilities  []string `json:"capabilities,omitempty"`
	Fallback      bool     `json:"fallback,omitempty"`
	HideWhenEmpty bool     `json:"hideWhenEmpty,omitempty"`
}

type ArchiveItemKind string

const (
	ArchiveProject    ArchiveItemKind = "project"
	ArchiveDocument   ArchiveItemKind = "document"
	ArchiveCollection ArchiveItemKind = "collection"
	ArchiveLink       ArchiveItemKind = "link"
	ArchiveApp        ArchiveItemKind = "app"
)

type ArchiveItemConfig struct {
	ID      string          `json:"id"`
	Type    ArchiveItemKind `json:"type"`
	Ref     string          `json:"ref,omitempty"`
	Visible *bool           `json:"visible,omitempty"`
	Source  string          `json:"source,omitempty"`
	URL     string          `json:"url,omitempty"`
	Label   string          `json:"label,omitempty"`
	Icon    string          `json:"icon,omitempty"`
}

type ArchiveFolder struct {
	Key      string
	Label    string
	Symbol   string
	Projects []Project
}

type ArchiveItem struct {
	ID       string
	Kind     ArchiveItemKind
	Project  Project
	Document Document
	Folder   ArchiveFolder
	Ref      string
	Label    string
	Icon     string
	URL      string
	Identity bool
}

// Archive contains exactly the visible entries and the content they can open.
type Archive struct {
	Items     []ArchiveItem
	Folders   []ArchiveFolder
	Projects  []Project
	Documents []Document
}

func (archive Archive) HasApp(ref string) bool {
	for _, item := range archive.Items {
		if item.Kind == ArchiveApp && item.Ref == ref {
			return true
		}
	}
	return false
}

var HomeArchive = mustLoadArchive()

func mustLoadArchive() Archive {
	catalog, err := loadArchiveCatalog(contentFiles)
	if err == nil {
		var archive Archive
		archive, err = ResolveArchive(catalog, Projects, Documents, Profile.Contact)
		if err == nil {
			return archive
		}
	}
	panic(err)
}

func loadArchiveCatalog(files fs.FS) (ArchiveCatalog, error) {
	source, err := fs.ReadFile(files, "data/archive.json")
	if err != nil {
		return ArchiveCatalog{}, fmt.Errorf("read archive catalog: %w", err)
	}
	var catalog ArchiveCatalog
	decoder := json.NewDecoder(strings.NewReader(string(source)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&catalog); err != nil {
		return catalog, fmt.Errorf("decode archive catalog: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return catalog, fmt.Errorf("archive catalog must contain one JSON object")
	}
	return catalog, nil
}

// ResolveArchive validates every entry, including hidden entries, before rendering.
// Omitting an entry affects the home only; published routes keep their catalogs.
func ResolveArchive(catalog ArchiveCatalog, projects []Project, documents []Document, contact ContactDetails) (Archive, error) {
	if err := validateProjectRelations(projects); err != nil {
		return Archive{}, err
	}
	archive := Archive{}
	folders := make(map[string]ArchiveFolder)
	assigned := make(map[string]bool)
	fallback := ""
	for index, config := range catalog.Collections {
		fail := func(reason string) (Archive, error) {
			return Archive{}, fmt.Errorf("archive.collections[%d]: %s", index, reason)
		}
		if !documentSlugPattern.MatchString(config.ID) || strings.TrimSpace(config.Label) == "" || strings.TrimSpace(config.Symbol) == "" {
			return fail("id, label and symbol are required; id must be a slug")
		}
		if _, exists := folders[config.ID]; exists {
			return fail("duplicate collection " + config.ID)
		}
		if config.Fallback {
			if fallback != "" || len(config.Capabilities) != 0 {
				return fail("only one fallback collection is allowed, without capabilities")
			}
			fallback = config.ID
		} else if len(config.Capabilities) == 0 {
			return fail("capabilities are required for a non-fallback collection")
		}
		for _, capability := range config.Capabilities {
			if strings.TrimSpace(capability) == "" {
				return fail("capabilities must not contain empty values")
			}
		}
		folder := ArchiveFolder{Key: config.ID, Label: config.Label, Symbol: config.Symbol}
		for _, project := range projects {
			if archiveProjectAvailable(project) && matchesArchiveCollection(project, config.Capabilities) {
				folder.Projects = append(folder.Projects, project)
				assigned[project.Slug] = true
			}
		}
		folders[config.ID] = folder
	}
	if fallback != "" {
		folder := folders[fallback]
		for _, project := range projects {
			if archiveProjectAvailable(project) && !assigned[project.Slug] {
				folder.Projects = append(folder.Projects, project)
			}
		}
		folders[fallback] = folder
	}
	projectBySlug := make(map[string]Project)
	for _, project := range projects {
		if archiveProjectAvailable(project) {
			projectBySlug[project.Slug] = project
		}
	}
	documentBySlug := make(map[string]Document)
	for _, document := range documents {
		documentBySlug[document.Slug] = document
	}
	seenIDs, seenRefs, consulted := map[string]bool{}, map[string]bool{}, map[string]bool{}
	for index, config := range catalog.Items {
		fail := func(reason string) (Archive, error) {
			return Archive{}, fmt.Errorf("archive.items[%d] (%s): %s", index, config.ID, reason)
		}
		if !documentSlugPattern.MatchString(config.ID) || seenIDs[config.ID] {
			return fail("invalid or duplicate id")
		}
		seenIDs[config.ID] = true
		if config.Type != ArchiveLink && (config.Source != "" || config.URL != "" || config.Label != "" || config.Icon != "") {
			return fail("source, url, label and icon are only supported for links")
		}
		item := ArchiveItem{ID: config.ID, Kind: config.Type, Ref: config.Ref}
		omit := config.Visible != nil && !*config.Visible
		switch config.Type {
		case ArchiveProject:
			project, exists := projectBySlug[config.Ref]
			if !exists {
				return fail("project not found: " + config.Ref)
			}
			item.Project = project
		case ArchiveDocument:
			document, exists := documentBySlug[config.Ref]
			if !exists || (document.Kind != DocumentNote && document.Kind != DocumentArticle) {
				return fail("note or article not found: " + config.Ref)
			}
			item.Document = document
		case ArchiveCollection:
			folder, exists := folders[config.Ref]
			if !exists {
				return fail("collection not found: " + config.Ref)
			}
			item.Folder = folder
			for _, collection := range catalog.Collections {
				if collection.ID == config.Ref && collection.HideWhenEmpty && len(folder.Projects) == 0 {
					omit = true
				}
			}
		case ArchiveApp:
			if config.Ref != "snake" {
				return fail("unknown app: " + config.Ref)
			}
		case ArchiveLink:
			if config.Ref != "" || strings.TrimSpace(config.Label) == "" || strings.TrimSpace(config.Icon) == "" || (config.Source == "") == (config.URL == "") {
				return fail("link requires label, icon and exactly one of source or url, without ref")
			}
			item.Label, item.Icon, item.URL = config.Label, config.Icon, config.URL
			if config.Source != "" {
				switch config.Source {
				case "contact.githubURL":
					item.URL = contact.GitHubURL
				case "contact.linkedInURL":
					item.URL = contact.LinkedInURL
				case "contact.sourceURL":
					item.URL = contact.SourceURL
				default:
					return fail("unknown link source: " + config.Source)
				}
				item.Identity = config.Source != "contact.sourceURL"
			}
			if item.URL == "" {
				omit = true // Optional profile channels have no tile when unset.
			} else if parsed, err := url.Parse(item.URL); err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
				return fail("link URL must be an absolute http or https URL")
			}
		default:
			return fail("unknown type: " + string(config.Type))
		}
		if config.Type != ArchiveLink {
			key := string(config.Type) + ":" + config.Ref
			if seenRefs[key] {
				return fail("duplicate reference: " + key)
			}
			seenRefs[key] = true
		}
		if omit {
			continue
		}
		archive.Items = append(archive.Items, item)
		switch item.Kind {
		case ArchiveProject:
			consulted[item.Project.Slug] = true
		case ArchiveDocument:
			archive.Documents = append(archive.Documents, item.Document)
		case ArchiveCollection:
			archive.Folders = append(archive.Folders, item.Folder)
			for _, project := range item.Folder.Projects {
				consulted[project.Slug] = true
			}
		}
	}
	includeRelatedProjects(consulted, projectBySlug)
	for _, project := range projects {
		if consulted[project.Slug] {
			archive.Projects = append(archive.Projects, project)
		}
	}
	return archive, nil
}

func archiveProjectAvailable(project Project) bool {
	return project.Slug != "" && project.Title != ""
}

func matchesArchiveCollection(project Project, capabilities []string) bool {
	for _, capability := range project.Capabilities {
		for _, selector := range capabilities {
			if capability == selector {
				return true
			}
		}
	}
	return false
}
