package views

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"portfolio/internal/portfolio"
)

func TestProjectCoverPreservesExplicitCoverAsset(t *testing.T) {
	project := portfolio.Project{
		Slug: "example-project",
		Media: portfolio.ProjectMedia{
			Cover: "cover",
			Items: []portfolio.ProjectImage{
				{ID: "cover", Src: "/projects/covers/example-project.png"},
			},
		},
	}
	if got := projectCover(project).Src; got != project.Media.Items[0].Src {
		t.Errorf("cover source = %q, want %q", got, project.Media.Items[0].Src)
	}
}

func TestHomeRendersProjectArchive(t *testing.T) {
	t.Parallel()

	project := portfolio.Project{
		Slug:          "example-project",
		Index:         "01",
		Title:         "Example Project",
		Capabilities:  []string{"interfaces"},
		FeaturedStack: []string{"TypeScript", "Cloudflare Workers"},
		Media: portfolio.ProjectMedia{
			Cover: "cover",
			Items: []portfolio.ProjectImage{
				{ID: "cover", Src: "/projects/example/cover.png", Width: 1200, Height: 800},
				{ID: "detail", Src: "/projects/example/detail.png", Width: 900, Height: 600},
			},
		},
	}

	archive, err := portfolio.ResolveArchive(portfolio.ArchiveCatalog{
		Collections: []portfolio.ArchiveCollectionConfig{{ID: "interfaces", Label: "Interfaces", Symbol: "@", Capabilities: []string{"interfaces"}}},
		Items:       []portfolio.ArchiveItemConfig{{ID: "interfaces", Type: portfolio.ArchiveCollection, Ref: "interfaces"}, {ID: "example", Type: portfolio.ArchiveProject, Ref: project.Slug}},
	}, []portfolio.Project{project}, nil, portfolio.ContactDetails{})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := Home(portfolio.ProfileContent{}, []portfolio.Project{project}, archive, "/portfolio", "https://example.com").Render(context.Background(), &output); err != nil {
		t.Fatalf("Home().Render() returned error: %v", err)
	}

	html := output.String()
	assertContains(t, html, `data-archive-folder="interfaces"`)
	assertContains(t, html, `aria-label="Documentos do portfólio"`)
	assertContains(t, html, `data-scroll-area-viewport`)
	assertContains(t, html, `data-archive-case="example-project"`)
	assertContains(t, html, `src="/portfolio/projects/covers/example-project.webp"`)
	assertContains(t, html, `loading="eager" decoding="async"`)
	assertContains(t, html, `href="/portfolio/case/example-project"`)
	assertContains(t, html, `data-archive-files="interfaces"`)
	assertContains(t, html, `data-archive-file="example-project"`)
	if got, want := strings.Count(html, "data-archive-file=\"example-project\""), 1; got != want {
		t.Errorf("archive file references = %d, want %d", got, want)
	}
}

func TestHomeArchiveUsesCatalogOrderAndOnlyVisiblePopups(t *testing.T) {
	profile := portfolio.ProfileContent{}
	documents := []portfolio.Document{
		{Slug: "visible", Title: "Visible", Kind: portfolio.DocumentNote},
		{Slug: "hidden", Title: "Hidden", Kind: portfolio.DocumentNote},
		{Slug: "article", Title: "Article", Kind: portfolio.DocumentArticle},
	}
	hidden := false
	archive, err := portfolio.ResolveArchive(portfolio.ArchiveCatalog{Items: []portfolio.ArchiveItemConfig{
		{ID: "external", Type: portfolio.ArchiveLink, URL: "https://example.com", Label: "Example", Icon: "EX"},
		{ID: "article", Type: portfolio.ArchiveDocument, Ref: "article"},
		{ID: "visible", Type: portfolio.ArchiveDocument, Ref: "visible"},
		{ID: "hidden", Type: portfolio.ArchiveDocument, Ref: "hidden", Visible: &hidden},
		{ID: "snake", Type: portfolio.ArchiveApp, Ref: "snake", Visible: &hidden},
	}}, nil, documents, profile.Contact)
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := Home(profile, nil, archive, "/portfolio", "https://example.com/portfolio").Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	assertContains(t, html, `3 ITENS`)
	assertContains(t, html, `project-archive--empty-cases`)
	assertContains(t, html, `href="/portfolio/article/article"`)
	assertContains(t, html, `data-document-note="visible"`)
	assertNotContains(t, html, `data-document-note="hidden"`)
	assertNotContains(t, html, `id="snake-game"`)
	if !(strings.Index(html, `data-archive-id="external"`) < strings.Index(html, `data-archive-id="article"`) && strings.Index(html, `data-archive-id="article"`) < strings.Index(html, `data-archive-id="visible"`)) {
		t.Fatal("grid did not preserve catalog order")
	}
}

func TestHomeArchiveRendersEnabledAppAndEmptyCollection(t *testing.T) {
	archive, err := portfolio.ResolveArchive(portfolio.ArchiveCatalog{
		Collections: []portfolio.ArchiveCollectionConfig{{ID: "empty", Label: "Empty", Symbol: "@", Capabilities: []string{"interfaces"}}},
		Items: []portfolio.ArchiveItemConfig{
			{ID: "empty", Type: portfolio.ArchiveCollection, Ref: "empty"},
			{ID: "snake", Type: portfolio.ArchiveApp, Ref: "snake"},
		},
	}, nil, nil, portfolio.ContactDetails{})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := Home(portfolio.ProfileContent{}, nil, archive, "", "https://example.com").Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	assertContains(t, output.String(), `2 ITENS`)
	assertContains(t, output.String(), `disabled aria-expanded="false"`)
	assertContains(t, output.String(), `id="snake-game"`)
}

func TestArchiveRelatedProjectUsesExistingTextArrowAndDestinationTitle(t *testing.T) {
	projects := []portfolio.Project{
		{Slug: "source", Title: "Source", Relations: []portfolio.ProjectRelation{{Ref: "target", Label: "Design system de"}, {Ref: "another", Label: "Uses"}}},
		{Slug: "target", Title: "Destination title"},
		{Slug: "another", Title: "Another"},
	}
	archive, err := portfolio.ResolveArchive(portfolio.ArchiveCatalog{Items: []portfolio.ArchiveItemConfig{{ID: "source", Type: portfolio.ArchiveProject, Ref: "source"}}}, projects, nil, portfolio.ContactDetails{})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := ProjectArchive(archive, "/portfolio").Render(context.Background(), &output); err != nil {
		t.Fatal(err)
	}
	html := output.String()
	assertContains(t, html, `data-archive-related="target" href="/portfolio/case/target"`)
	assertContains(t, html, `<span class="ui-arrow" aria-hidden="true">↳</span>`)
	assertContains(t, html, `<span class="tooltip__description">Design system de</span>`)
	assertContains(t, html, `<span class="tooltip__title">Destination title</span>`)
	assertContains(t, html, `data-archive-case="target"`)
	assertNotContains(t, html, `data-archive-project="target"`)
	assertNotContains(t, html, `data-archive-related="another"`)
	if strings.Count(html, `class="project-archive__case-relation"`) != 1 {
		t.Fatal("only the first relation should occupy the footer")
	}
}

func TestHomeArchiveRendersSkiWithBasePathAndIndependentAppTriggers(t *testing.T) {
	for _, visible := range []bool{true, false} {
		archive, err := portfolio.ResolveArchive(portfolio.ArchiveCatalog{
			Items: []portfolio.ArchiveItemConfig{
				{ID: "snake", Type: portfolio.ArchiveApp, Ref: "snake"},
				{ID: "ski-custom-id", Type: portfolio.ArchiveApp, Ref: "ski", Visible: &visible},
			},
		}, nil, nil, portfolio.ContactDetails{})
		if err != nil {
			t.Fatal(err)
		}
		var output bytes.Buffer
		if err := Home(portfolio.ProfileContent{}, nil, archive, "/portfolio", "https://example.com/portfolio").Render(context.Background(), &output); err != nil {
			t.Fatal(err)
		}
		html := output.String()
		assertContains(t, html, `data-popup-trigger="snake"`)
		assertContains(t, html, `id="snake-game"`)
		if visible {
			assertContains(t, html, `data-archive-id="ski-custom-id" data-popup-trigger="ski"`)
			assertContains(t, html, `aria-controls="ski-game"`)
			assertContains(t, html, `data-ski-assets="/portfolio/ski/sprites"`)
			assertContains(t, html, `width="640" height="360"`)
		} else {
			assertNotContains(t, html, `id="ski-game"`)
			assertNotContains(t, html, `data-popup-trigger="ski"`)
		}
	}
}
