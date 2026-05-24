package handler

import (
	"net/http"

	"github.com/samudera/fish-coldstorage/internal/audit"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type AuditHandler struct {
	log *audit.Log
}

func NewAuditHandler(log *audit.Log) *AuditHandler { return &AuditHandler{log: log} }

// GET /v1/audit?entity_type=fish_type&limit=50&offset=0
func (h *AuditHandler) List(w http.ResponseWriter, r *http.Request) {
	entityType := r.URL.Query().Get("entity_type")
	limit, offset := paginate(r)

	entries, err := h.log.List(r.Context(), entityType, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	total, _ := h.log.Count(r.Context(), entityType)
	if entries == nil {
		entries = []audit.Entry{}
	}
	writeJSON(w, http.StatusOK, domain.ListResponse{Data: entries, Total: total, Limit: limit})
}
