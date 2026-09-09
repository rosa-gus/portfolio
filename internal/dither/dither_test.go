package dither

import (
	"image"
	"image/color"
	"testing"
)

func TestParseHexColor(t *testing.T) {
	got, err := ParseHexColor("#ff8617")
	if err != nil {
		t.Fatal(err)
	}
	want := color.NRGBA{R: 255, G: 134, B: 23, A: 255}
	if got != want {
		t.Fatalf("ParseHexColor() = %#v, want %#v", got, want)
	}
}

func TestApplyPreservesTransparentPixels(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 2, 1))
	source.SetNRGBA(0, 0, color.NRGBA{A: 0})
	source.SetNRGBA(1, 0, color.NRGBA{R: 255, G: 255, B: 255, A: 255})

	output, err := Apply(source, Options{
		Matrix:   2,
		Dark:     color.NRGBA{A: 255},
		Light:    color.NRGBA{R: 255, G: 255, B: 255, A: 255},
		Contrast: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := output.ColorIndexAt(0, 0); got != 0 {
		t.Fatalf("transparent pixel index = %d, want 0", got)
	}
	if got := output.ColorIndexAt(1, 0); got != 2 {
		t.Fatalf("light pixel index = %d, want 2", got)
	}
}

func TestApplyRejectsInvalidMatrix(t *testing.T) {
	_, err := Apply(image.NewNRGBA(image.Rect(0, 0, 1, 1)), Options{Matrix: 3, Contrast: 1})
	if err == nil {
		t.Fatal("Apply() should reject an invalid matrix")
	}
}
