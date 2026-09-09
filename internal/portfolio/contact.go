package portfolio

type ContactDetails struct {
	Heading      string `json:"heading"`
	Introduction string `json:"introduction"`
	Email        string `json:"email"`
	GitHubURL    string `json:"githubURL"`
	LinkedInURL  string `json:"linkedInURL"`
	SourceURL    string `json:"sourceURL"`
}
