package portfolio

import (
	"strings"
	"testing"
)

func TestRelationsKeepProjectsWithoutGridIconsConsultable(t *testing.T) {
	projects := []Project{
		{Slug: "jaci", Title: "Jaci UI", Relations: []ProjectRelation{{Ref: "abrigo", Label: "Design system de"}}},
		{Slug: "abrigo", Title: "Abrigo do Wlad", Relations: []ProjectRelation{{Ref: "jaci", Label: "Utiliza"}}},
		{Slug: "unrelated", Title: "Unrelated"},
	}
	archive, err := ResolveArchive(ArchiveCatalog{Items: []ArchiveItemConfig{{ID: "jaci", Type: ArchiveProject, Ref: "jaci"}}}, projects, nil, ContactDetails{})
	if err != nil {
		t.Fatal(err)
	}
	if len(archive.Items) != 1 || len(archive.Projects) != 2 || archive.Projects[1].Slug != "abrigo" {
		t.Fatalf("relations must add consultation panels without grid items: %+v", archive)
	}
	archive, err = ResolveArchive(ArchiveCatalog{}, projects, nil, ContactDetails{})
	if err != nil || len(archive.Projects) != 0 {
		t.Fatalf("relations alone must not publish grid or consultation items: %+v, %v", archive, err)
	}
}

func TestProjectRelationsRejectBrokenDestinations(t *testing.T) {
	for _, relation := range []ProjectRelation{
		{Ref: "missing", Label: "Uses"},
		{Ref: "source", Label: "Uses"},
		{Ref: "target", Label: " "},
	} {
		projects := []Project{{Slug: "source", Title: "Source", Relations: []ProjectRelation{relation}}, {Slug: "target", Title: "Target"}}
		if err := validateProjectRelations(projects); err == nil || !strings.Contains(err.Error(), `project "source" relations[0]`) {
			t.Fatalf("expected an actionable error for %+v, got %v", relation, err)
		}
	}
	projects := []Project{{Slug: "source", Title: "Source", Relations: []ProjectRelation{{Ref: "target", Label: "Uses"}, {Ref: "target", Label: "Uses again"}}}, {Slug: "target", Title: "Target"}}
	if err := validateProjectRelations(projects); err == nil {
		t.Fatal("duplicate destination accepted")
	}
}
