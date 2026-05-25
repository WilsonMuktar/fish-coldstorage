package storage

import (
	"bytes"
	"context"
	"fmt"
	"mime"
	"path/filepath"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type R2Client struct {
	client    *s3.Client
	bucket    string
	publicURL string // e.g. https://pub-xxx.r2.dev
}

// NewR2Client creates a client. publicURL is the r2.dev public domain (no trailing slash).
func NewR2Client(accountID, accessKey, secretKey, bucket, publicURL string) (*R2Client, error) {
	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID)
	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		config.WithRegion("auto"),
	)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
	})
	return &R2Client{
		client:    client,
		bucket:    bucket,
		publicURL: publicURL,
	}, nil
}

// Upload stores a file and returns its public URL.
func (r *R2Client) Upload(ctx context.Context, key string, data []byte, filename string) (string, error) {
	ct := mime.TypeByExtension(filepath.Ext(filename))
	if ct == "" {
		ct = "application/octet-stream"
	}
	_, err := r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(r.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(ct),
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s/%s", r.publicURL, key), nil
}

// Delete removes a file by key.
func (r *R2Client) Delete(ctx context.Context, key string) error {
	_, err := r.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
	})
	return err
}

// KeyFromURL extracts the object key from a full R2 URL.
// e.g. "https://.../fish-coldstorage/fish/abc.jpg" → "fish/abc.jpg"
func (r *R2Client) KeyFromURL(photoURL string) string {
	prefix := r.publicURL + "/"
	if len(photoURL) > len(prefix) && photoURL[:len(prefix)] == prefix {
		return photoURL[len(prefix):]
	}
	return ""
}

// Replace uploads a new file and deletes the old one if it exists.
func (r *R2Client) Replace(ctx context.Context, oldURL, newKey string, data []byte, filename string) (string, error) {
	newURL, err := r.Upload(ctx, newKey, data, filename)
	if err != nil {
		return "", err
	}
	if oldURL != "" {
		if oldKey := r.KeyFromURL(oldURL); oldKey != "" {
			_ = r.Delete(ctx, oldKey) // best-effort, don't fail on cleanup error
		}
	}
	return newURL, nil
}
