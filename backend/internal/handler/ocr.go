package handler

import (
	"io"
	"net/http"

	"github.com/samudera/fish-coldstorage/internal/ocr"
	"github.com/samudera/fish-coldstorage/internal/ollama"
)

type OCRHandler struct {
	ocrClient    *ocr.Client
	ollamaClient *ollama.Client
}

func NewOCRHandler(ocrClient *ocr.Client, ollamaClient *ollama.Client) *OCRHandler {
	return &OCRHandler{ocrClient: ocrClient, ollamaClient: ollamaClient}
}

// POST /v1/ocr-extract — accepts multipart form with "photo" field
func (h *OCRHandler) Extract(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid form")
		return
	}
	file, header, err := r.FormFile("photo")
	if err != nil {
		writeError(w, http.StatusBadRequest, "photo required")
		return
	}
	defer file.Close()

	imgBytes, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "read error")
		return
	}

	receiptHint := r.FormValue("receipt_hint")

	// Try OCR first, fall back to vision
	ocrResult, err := h.ocrClient.Extract(r.Context(), imgBytes, header.Filename)
	var intent interface{}
	if err != nil {
		// Fallback: vision-only
		i, vErr := h.ollamaClient.ExtractFromReceipt(r.Context(), imgBytes)
		if vErr != nil {
			writeError(w, http.StatusInternalServerError, "OCR and vision both failed")
			return
		}
		intent = i
	} else {
		i, sErr := h.ollamaClient.ExtractFromOCRTextWithHint(r.Context(), ocrResult.FormatTableText(), receiptHint)
		if sErr != nil {
			// Fallback to vision
			i2, vErr := h.ollamaClient.ExtractFromReceipt(r.Context(), imgBytes)
			if vErr != nil {
				writeError(w, http.StatusInternalServerError, "extraction failed")
				return
			}
			intent = i2
		} else {
			intent = i
		}
	}

	writeJSON(w, http.StatusOK, intent)
}
