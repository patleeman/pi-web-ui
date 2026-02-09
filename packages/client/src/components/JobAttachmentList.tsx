import { useState } from 'react';
import { X, FileImage, FileText, Download } from 'lucide-react';
import type { JobAttachment } from '@pi-deck/shared';

interface JobAttachmentListProps {
  attachments: JobAttachment[];
  jobPath: string;
  workspaceId: string;
  onRemove: (attachmentId: string) => void;
  onRead?: (attachmentId: string) => Promise<{ base64Data: string; mediaType: string } | null>;
  onDownload?: (attachment: JobAttachment) => void;
}

export function JobAttachmentList({
  attachments,
  onRemove,
  onRead,
  onDownload,
}: JobAttachmentListProps) {
  const [previewImage, setPreviewImage] = useState<{ base64Data: string; mediaType: string; name: string } | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleImageClick = async (attachment: JobAttachment) => {
    if (attachment.type !== 'image' || !onRead) return;

    try {
      const result = await onRead(attachment.id);
      if (result) {
        setPreviewImage({
          base64Data: result.base64Data,
          mediaType: result.mediaType,
          name: attachment.name,
        });
      }
    } catch (error) {
      console.error('Failed to load image preview:', error);
    }
  };

  const handleRemove = (attachment: JobAttachment, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Remove "${attachment.name}"?`)) {
      onRemove(attachment.id);
    }
  };

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div className="job-attachments">
        <div className="job-attachments-header">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Attachments ({attachments.length})
          </span>
        </div>
        <div className="job-attachments-grid">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="job-attachment-item"
              onClick={() => {
                if (attachment.type === 'image') {
                  handleImageClick(attachment);
                } else if (onDownload) {
                  onDownload(attachment);
                }
              }}
            >
              <div className="job-attachment-icon">
                {attachment.type === 'image' ? (
                  <FileImage className="w-4 h-4" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
              </div>
              <div className="job-attachment-info">
                <div className="job-attachment-name" title={attachment.name}>
                  {attachment.name}
                </div>
                <div className="job-attachment-size">{formatFileSize(attachment.size)}</div>
              </div>
              <button
                className="job-attachment-remove"
                onClick={(e) => handleRemove(attachment, e)}
                title="Remove attachment"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="job-attachment-modal-overlay"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="job-attachment-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="job-attachment-modal-header">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {previewImage.name}
              </span>
              <button
                className="job-attachment-modal-close"
                onClick={() => setPreviewImage(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="job-attachment-modal-body">
              <img
                src={`data:${previewImage.mediaType};base64,${previewImage.base64Data}`}
                alt={previewImage.name}
                className="job-attachment-modal-image"
              />
            </div>
            {onDownload && (
              <div className="job-attachment-modal-footer">
                <button
                  className="job-attachment-modal-download"
                  onClick={() => {
                    onDownload({
                      id: '',
                      type: 'image',
                      name: previewImage.name,
                      path: '',
                      mediaType: previewImage.mediaType,
                      size: 0,
                      createdAt: '',
                    });
                    setPreviewImage(null);
                  }}
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
