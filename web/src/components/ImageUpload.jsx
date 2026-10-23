import React, { useRef } from 'react';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/jpg';

function ImageUpload({ onFile, disabled = false, label = 'Drop an image here or browse' }) {
  const inputRef = useRef(null);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (PNG, JPG, or WebP).');
      return;
    }
    onFile(file);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
        disabled
          ? 'opacity-50 pointer-events-none border-gray-200 dark:border-gray-700'
          : 'border-gray-300 dark:border-gray-600 hover:border-violet-400 dark:hover:border-violet-500 bg-white dark:bg-gray-800'
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
    >
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{label}</p>
      <button
        type="button"
        className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        Browse files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-xs text-gray-400 mt-3">PNG, JPG, or WebP — max ~25 MB</p>
    </div>
  );
}

export default ImageUpload;
