
import React from 'react';

interface SkeletonProps {
  type?: 'card' | 'table' | 'text' | 'profile';
  count?: number;
}

const SkeletonLoader: React.FC<SkeletonProps> = ({ type = 'text', count = 1 }) => {
  const renderSkeleton = () => {
    switch (type) {
      case 'card':
        return (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 animate-pulse">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-slate-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-slate-100 rounded w-1/4"></div>
              </div>
            </div>
            <div className="h-20 bg-slate-100 rounded-xl mb-4"></div>
            <div className="flex justify-between">
              <div className="h-8 bg-slate-200 rounded w-1/4"></div>
              <div className="h-8 bg-slate-200 rounded w-1/4"></div>
            </div>
          </div>
        );
      case 'table':
        return (
          <div className="bg-white rounded-2xl p-4 animate-pulse border border-slate-100">
            <div className="h-10 bg-slate-200 rounded-lg mb-4"></div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 mb-3">
                <div className="h-4 bg-slate-100 rounded w-1/4"></div>
                <div className="h-4 bg-slate-100 rounded w-1/4"></div>
                <div className="h-4 bg-slate-100 rounded w-1/4"></div>
                <div className="h-4 bg-slate-100 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        );
      case 'profile':
        return (
            <div className="flex flex-col items-center animate-pulse">
                <div className="w-24 h-24 bg-slate-200 rounded-full mb-4"></div>
                <div className="h-6 bg-slate-200 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-slate-100 rounded w-1/3"></div>
            </div>
        );
      default:
        return <div className="h-4 bg-slate-200 rounded w-full animate-pulse mb-2"></div>;
    }
  };

  return (
    <div className={`grid gap-4 ${type === 'card' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="w-full">
          {renderSkeleton()}
        </div>
      ))}
    </div>
  );
};

export default SkeletonLoader;
