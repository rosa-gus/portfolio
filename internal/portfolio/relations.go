package portfolio

import (
	"fmt"
	"strings"
)

func validateProjectRelations(projects []Project) error {
	available := make(map[string]bool, len(projects))
	for _, project := range projects {
		if archiveProjectAvailable(project) {
			available[project.Slug] = true
		}
	}
	for _, project := range projects {
		seen := make(map[string]bool)
		for index, relation := range project.Relations {
			if strings.TrimSpace(relation.Label) == "" || !available[relation.Ref] || relation.Ref == project.Slug || seen[relation.Ref] {
				return fmt.Errorf("project %q relations[%d]: label and an existing, distinct project ref are required; duplicate refs are not allowed (%q)", project.Slug, index, relation.Ref)
			}
			seen[relation.Ref] = true
		}
	}
	return nil
}

// Related projects remain consultable even without a standalone grid icon.
// The visited set also permits explicitly authored reciprocal relations.
func includeRelatedProjects(consulted map[string]bool, projects map[string]Project) {
	pending := make([]string, 0, len(consulted))
	for slug := range consulted {
		pending = append(pending, slug)
	}
	for len(pending) > 0 {
		slug := pending[0]
		pending = pending[1:]
		for _, relation := range projects[slug].Relations {
			if !consulted[relation.Ref] {
				consulted[relation.Ref] = true
				pending = append(pending, relation.Ref)
			}
		}
	}
}
