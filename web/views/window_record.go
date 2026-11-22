package views

import (
	"net/url"
	"portfolio/internal/portfolio"
)

type windowRecordField struct {
	Label string
	Value string
	Date  string
	URL   string
}

func appendRecordMetadata(fields []windowRecordField, entries []portfolio.MetadataEntry) []windowRecordField {
	for _, entry := range entries {
		fields = append(fields, windowRecordField{Label: entry.Label, Value: entry.Value})
	}
	return fields
}

func noteRecord(document portfolio.Document) []windowRecordField {
	var fields []windowRecordField
	if document.UpdatedAt != "" {
		fields = append(fields, windowRecordField{Label: "Última edição", Date: document.UpdatedAt})
	}
	return appendRecordMetadata(fields, document.Metadata)
}

func appRecord(app portfolio.App, repository string) []windowRecordField {
	var fields []windowRecordField
	if app.PublishedAt != "" {
		fields = append(fields, windowRecordField{Label: "Publicado", Date: app.PublishedAt})
	}
	if app.Version != "" {
		fields = append(fields, windowRecordField{Label: "Versão", Value: "v" + app.Version})
	}
	if app.SourcePath != "" && repository != "" {
		if sourceURL, err := url.JoinPath(repository, "tree", "main", app.SourcePath); err == nil {
			fields = append(fields, windowRecordField{Label: "Código-fonte", Value: "Abrir no repositório", URL: sourceURL})
		}
	}
	if app.License != "" {
		fields = append(fields, windowRecordField{Label: "Licença do código", Value: app.License})
	}
	fields = appendRecordMetadata(fields, app.Metadata)
	return appendRecordMetadata(fields, app.Credits)
}
