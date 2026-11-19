package views

import (
	"net/url"
	"time"

	"github.com/a-h/templ"
	"portfolio/internal/portfolio"
)

func articleURL(basePath, slug string) templ.SafeURL {
	return siteURL(basePath, "/article/"+url.PathEscape(slug))
}

func documentDescription(document portfolio.Document) string {
	if document.Summary != "" {
		return document.Summary
	}
	return document.Title
}

func documentDateLabel(date string) string {
	parsed, err := time.Parse("2006-01-02", date)
	if err != nil {
		return ""
	}
	months := [...]string{"JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"}
	return parsed.Format("02") + " " + months[int(parsed.Month())-1] + " " + parsed.Format("2006")
}
