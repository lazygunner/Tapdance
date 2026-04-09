import { Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type ImagePreviewModalProps = {
  previewImage: string | null;
  onClose: () => void;
  onDownload: (url: string, filename: string) => void;
};

export function ImagePreviewModal({
  previewImage,
  onClose,
  onDownload,
}: ImagePreviewModalProps) {
  return (
    <AnimatePresence>
      {previewImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <div className="relative max-w-7xl max-h-full flex flex-col items-center justify-center" onClick={(event) => event.stopPropagation()}>
            <div className="absolute top-4 right-4 flex gap-2 z-10">
              <button
                onClick={() => onDownload(previewImage, 'generated-image.png')}
                className="p-2 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-sm transition-colors"
                title="下载图片"
              >
                <Upload className="w-5 h-5 rotate-180" />
              </button>
              <button
                onClick={onClose}
                className="p-2 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-sm transition-colors"
                title="关闭预览"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
