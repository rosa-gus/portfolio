package dither

import (
	"errors"
	"fmt"
	"image"
	"image/color"
	"math"
	"strconv"
	"strings"

	xdraw "golang.org/x/image/draw"
)

type Options struct {
	Width    int
	Matrix   int
	Dark     color.NRGBA
	Light    color.NRGBA
	Contrast float64
}

func Apply(source image.Image, options Options) (*image.Paletted, error) {
	if source == nil {
		return nil, errors.New("source image is missing")
	}
	if options.Matrix != 2 && options.Matrix != 4 && options.Matrix != 8 {
		return nil, fmt.Errorf("invalid matrix: use 2, 4, or 8")
	}
	if options.Contrast <= 0 {
		return nil, errors.New("contrast must be greater than zero")
	}

	resized := resize(source, options.Width)
	bounds := resized.Bounds()
	palette := color.Palette{
		color.NRGBA{R: 0, G: 0, B: 0, A: 0},
		options.Dark,
		options.Light,
	}
	output := image.NewPaletted(image.Rect(0, 0, bounds.Dx(), bounds.Dy()), palette)
	matrix := bayer(options.Matrix)
	levels := float64(options.Matrix * options.Matrix)

	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			r, g, b, a := resized.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA()
			if a < 0x8000 {
				output.SetColorIndex(x, y, 0)
				continue
			}

			luminance := 0.2126*float64(r)/65535 + 0.7152*float64(g)/65535 + 0.0722*float64(b)/65535
			luminance = clamp((luminance-0.5)*options.Contrast + 0.5)
			threshold := (float64(matrix[y%options.Matrix][x%options.Matrix]) + 0.5) / levels
			if luminance >= threshold {
				output.SetColorIndex(x, y, 2)
			} else {
				output.SetColorIndex(x, y, 1)
			}
		}
	}

	return output, nil
}

func ParseHexColor(value string) (color.NRGBA, error) {
	hex := strings.TrimPrefix(strings.TrimSpace(value), "#")
	if len(hex) != 6 {
		return color.NRGBA{}, fmt.Errorf("invalid color %q: use #RRGGBB", value)
	}
	parsed, err := strconv.ParseUint(hex, 16, 32)
	if err != nil {
		return color.NRGBA{}, fmt.Errorf("invalid color %q: %w", value, err)
	}
	return color.NRGBA{
		R: uint8(parsed >> 16),
		G: uint8(parsed >> 8),
		B: uint8(parsed),
		A: 255,
	}, nil
}

func resize(source image.Image, width int) image.Image {
	bounds := source.Bounds()
	if width <= 0 || width == bounds.Dx() {
		return source
	}
	height := int(math.Round(float64(bounds.Dy()) * float64(width) / float64(bounds.Dx())))
	output := image.NewNRGBA(image.Rect(0, 0, width, height))
	xdraw.CatmullRom.Scale(output, output.Bounds(), source, bounds, xdraw.Over, nil)
	return output
}

func bayer(size int) [][]int {
	matrix := [][]int{{0}}
	for len(matrix) < size {
		previousSize := len(matrix)
		next := make([][]int, previousSize*2)
		for y := range next {
			next[y] = make([]int, previousSize*2)
		}
		for y := 0; y < previousSize; y++ {
			for x := 0; x < previousSize; x++ {
				value := matrix[y][x] * 4
				next[y][x] = value
				next[y][x+previousSize] = value + 2
				next[y+previousSize][x] = value + 3
				next[y+previousSize][x+previousSize] = value + 1
			}
		}
		matrix = next
	}
	return matrix
}

func clamp(value float64) float64 {
	return math.Max(0, math.Min(1, value))
}
