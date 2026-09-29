package views

import (
	"bytes"
	"context"
	"testing"
)

func TestProjectImageViewerUsesVerticalScrollArea(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	if err := ProjectImageViewer().Render(context.Background(), &output); err != nil {
		t.Fatalf("ProjectImageViewer().Render() returned an error: %v", err)
	}

	html := output.String()
	assertContains(t, html, `class="project-image-viewer__media"><div class="scroll-area scroll-area--no-shadow" data-scroll-area data-axis="vertical">`)
	assertContains(t, html, `aria-label="Imagem ampliada do projeto"`)
}
