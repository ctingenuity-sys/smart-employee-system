import React from 'react';

const Loading: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-64 w-full">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-t-4 border-b-4 border-primary animate-spin"></div>
        <div className="absolute top-0 left-0 h-16 w-16 rounded-full border-t-4 border-b-4 border-primary animate-ping opacity-20"></div>
      </div>
    </div>
  );
};

export default Loading;
