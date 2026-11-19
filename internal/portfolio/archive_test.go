package portfolio

import (
	"strings"
	"testing"
	"testing/fstest"
)

func archiveFixture() (ArchiveCatalog, []Project, []Document) {
	catalog := ArchiveCatalog{
		Collections: []ArchiveCollectionConfig{
			{ID: "interfaces", Label: "Interfaces", Symbol: "@", Capabilities: []string{"interfaces"}},
			{ID: "other", Label: "Outros", Symbol: "+", Fallback: true, HideWhenEmpty: true},
		},
		Items: []ArchiveItemConfig{
			{ID: "note", Type: ArchiveDocument, Ref: "note"},
			{ID: "interfaces", Type: ArchiveCollection, Ref: "interfaces"},
			{ID: "other", Type: ArchiveCollection, Ref: "other"},
			{ID: "project", Type: ArchiveProject, Ref: "project"},
			{ID: "snake", Type: ArchiveApp, Ref: "snake"},
			{ID: "github", Type: ArchiveLink, Source: "contact.githubURL", Label: "GitHub", Icon: "GH"},
		},
	}
	return catalog, []Project{
		{Slug: "project", Title: "Project", Capabilities: []string{"interfaces", "interfaces"}},
		{Slug: "uncategorized", Title: "Uncategorized"},
	}, []Document{{Slug: "note", Title: "Note", Kind: DocumentNote}}
}

func TestArchiveResolvesOrderCollectionsAndOptionalChannels(t *testing.T) {
	catalog, projects, documents := archiveFixture()
	archive, err := ResolveArchive(catalog, projects, documents, ContactDetails{GitHubURL: "https://github.com/example"})
	if err != nil {
		t.Fatal(err)
	}
	if len(archive.Items) != 6 || archive.Items[0].ID != "note" || archive.Items[5].URL != "https://github.com/example" {
		t.Fatalf("unexpected visible items: %+v", archive.Items)
	}
	if len(archive.Folders) != 2 || len(archive.Folders[0].Projects) != 1 || archive.Folders[1].Projects[0].Slug != "uncategorized" {
		t.Fatalf("unexpected folders: %+v", archive.Folders)
	}
	if len(archive.Projects) != 2 || len(archive.Documents) != 1 || !archive.HasApp("snake") {
		t.Fatalf("missing reachable content: %+v", archive)
	}
	archive, err = ResolveArchive(catalog, projects[:1], documents, ContactDetails{})
	if err != nil || len(archive.Items) != 4 || len(archive.Folders) != 1 {
		t.Fatalf("empty fallback and unset GitHub should be omitted: %+v, %v", archive, err)
	}
}

func TestArchiveVisibilityDoesNotDeletePublishedContent(t *testing.T) {
	catalog, projects, documents := archiveFixture()
	hidden := false
	for index := range catalog.Items {
		catalog.Items[index].Visible = &hidden
	}
	archive, err := ResolveArchive(catalog, projects, documents, ContactDetails{})
	if err != nil {
		t.Fatal(err)
	}
	if len(archive.Items)+len(archive.Folders)+len(archive.Projects)+len(archive.Documents) != 0 || archive.HasApp("snake") {
		t.Fatalf("hidden entries leaked into home: %+v", archive)
	}
	if len(projects) != 2 || len(documents) != 1 {
		t.Fatal("resolution modified the source catalogs")
	}
}

func TestArchiveCollectionsKeepProjectsAccessibleWithoutStandaloneItems(t *testing.T) {
	catalog, projects, documents := archiveFixture()
	catalog.Items = catalog.Items[1:2]
	archive, err := ResolveArchive(catalog, projects, documents, ContactDetails{})
	if err != nil || len(archive.Projects) != 1 || archive.Projects[0].Slug != "project" {
		t.Fatalf("collection projects must have consultation panels: %+v, %v", archive, err)
	}
}

func TestArchiveAcceptsEmptyGridAndDirectArticleAndLink(t *testing.T) {
	archive, err := ResolveArchive(ArchiveCatalog{}, nil, nil, ContactDetails{})
	if err != nil || len(archive.Items) != 0 {
		t.Fatalf("empty archive: %+v, %v", archive, err)
	}
	archive, err = ResolveArchive(ArchiveCatalog{Items: []ArchiveItemConfig{
		{ID: "article", Type: ArchiveDocument, Ref: "article"},
		{ID: "link", Type: ArchiveLink, URL: "https://example.com", Label: "Example", Icon: "EX"},
	}}, nil, []Document{{Slug: "article", Title: "Article", Kind: DocumentArticle}}, ContactDetails{})
	if err != nil || len(archive.Items) != 2 || archive.Items[0].Document.Kind != DocumentArticle || archive.Items[1].Identity {
		t.Fatalf("article and external link: %+v, %v", archive, err)
	}
}

func TestArchiveRejectsInvalidReferencesAndDefinitions(t *testing.T) {
	for _, test := range []struct {
		name string
		edit func(*ArchiveCatalog)
		want string
	}{
		{"duplicate id", func(c *ArchiveCatalog) { c.Items[1].ID = "note" }, "archive.items[1]"},
		{"missing project", func(c *ArchiveCatalog) { c.Items[3].Ref = "missing" }, "project not found"},
		{"missing document", func(c *ArchiveCatalog) { c.Items[0].Ref = "missing" }, "note or article not found"},
		{"missing collection", func(c *ArchiveCatalog) { c.Items[1].Ref = "missing" }, "collection not found"},
		{"unknown app", func(c *ArchiveCatalog) { c.Items[4].Ref = "missing" }, "unknown app"},
		{"unknown type", func(c *ArchiveCatalog) { c.Items[0].Type = "unknown" }, "unknown type"},
		{"duplicate reference", func(c *ArchiveCatalog) {
			c.Items = append(c.Items, ArchiveItemConfig{ID: "again", Type: ArchiveDocument, Ref: "note"})
		}, "duplicate reference"},
		{"bad URL", func(c *ArchiveCatalog) { c.Items[5].Source = ""; c.Items[5].URL = "javascript:alert(1)" }, "absolute http or https"},
		{"missing link label", func(c *ArchiveCatalog) { c.Items[5].Label = "" }, "link requires"},
		{"conflicting source", func(c *ArchiveCatalog) { c.Items[5].URL = "https://example.com" }, "link requires"},
		{"unknown source", func(c *ArchiveCatalog) { c.Items[5].Source = "unknown" }, "unknown link source"},
		{"irrelevant field", func(c *ArchiveCatalog) { c.Items[0].URL = "https://example.com" }, "only supported for links"},
		{"duplicate collection", func(c *ArchiveCatalog) { c.Collections = append(c.Collections, c.Collections[0]) }, "duplicate collection"},
		{"missing selector", func(c *ArchiveCatalog) { c.Collections[0].Capabilities = nil }, "capabilities are required"},
		{"duplicate fallback", func(c *ArchiveCatalog) { c.Collections[0].Fallback = true; c.Collections[0].Capabilities = nil }, "only one fallback"},
		{"hidden invalid reference", func(c *ArchiveCatalog) { hidden := false; c.Items[0].Visible = &hidden; c.Items[0].Ref = "missing" }, "note or article not found"},
	} {
		t.Run(test.name, func(t *testing.T) {
			catalog, projects, documents := archiveFixture()
			test.edit(&catalog)
			_, err := ResolveArchive(catalog, projects, documents, ContactDetails{})
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got %v, want error containing %q", err, test.want)
			}
		})
	}
}

func TestArchiveCatalogRejectsTyposAndTrailingJSON(t *testing.T) {
	for _, source := range []string{`{"itmes": []}`, `{"items":[{"id":"note","visibile":false}]}`, `{} {}`, `not json`} {
		_, err := loadArchiveCatalog(fstest.MapFS{"data/archive.json": {Data: []byte(source)}})
		if err == nil {
			t.Fatalf("accepted invalid catalog: %s", source)
		}
	}
}
