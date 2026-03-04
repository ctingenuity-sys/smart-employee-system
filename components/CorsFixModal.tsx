import React from 'react';

interface CorsFixModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CorsFixModal: React.FC<CorsFixModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const corsConfig = [
    {
      "origin": ["*"],
      "method": ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
      "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
      "maxAgeSeconds": 3600
    }
  ];

  const downloadCorsConfig = () => {
    const blob = new Blob([JSON.stringify(corsConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cors.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fade-in-up">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <i className="fas fa-wrench text-amber-500"></i> Fix Upload Issue (CORS)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="space-y-4 text-slate-600 text-sm">
          <p className="font-bold text-red-500">
            The upload failed because Firebase Storage is blocking the request (CORS Policy).
          </p>
          <p>
            To fix this, you need to configure CORS for your Firebase Storage bucket.
          </p>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-700 mb-2">Step 1: Open Cloud Shell</h4>
            <p className="mb-2 text-xs">
              Go to <a href="https://console.firebase.google.com/project/radiology-inventory/storage" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Firebase Console (Storage)</a>.
              <br/>
              <span className="text-red-500 font-bold">Important:</span> Click "Get Started" to create the bucket if you haven't yet!
            </p>
            <p className="mb-2 text-xs">
              Then open Cloud Shell (top right `&gt;_`) or <a href="https://ssh.cloud.google.com/cloudshell/editor?project=radiology-inventory" target="_blank" rel="noreferrer" className="text-purple-600 underline font-bold">Click Here</a>.
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-700 mb-2">Step 2: Run Command</h4>
            <p className="mb-2 text-xs">Copy and paste this entire line into Cloud Shell:</p>
            <div className="bg-slate-900 text-green-400 p-3 rounded-lg font-mono text-[10px] overflow-x-auto select-all whitespace-pre-wrap break-all">
              {`echo '[{"origin": ["*"],"method": ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],"maxAgeSeconds": 3600}]' > cors.json && gsutil cors set cors.json gs://radiology-inventory.appspot.com`}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CorsFixModal;
