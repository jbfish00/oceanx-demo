export default function PayloadModal({ title, payload, onClose }) {
  if (!payload) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="overflow-auto p-6 space-y-4">
          {Object.entries(payload).map(([section, value]) => (
            <div key={section}>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                {section}
              </div>
              <pre className="bg-gray-900 text-green-200 text-xs p-4 rounded-lg overflow-auto font-mono">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
