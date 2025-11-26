import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying }) => {
  const bars = 10;
  
  return (
    <div className="flex items-end justify-center gap-1 h-12 w-full">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`w-2 bg-gradient-to-t from-primary to-secondary rounded-t-sm transition-all duration-300 ease-in-out ${isPlaying ? 'animate-pulse' : 'h-1'}`}
          style={{
            height: isPlaying ? `${Math.random() * 100}%` : '4px',
            animationDuration: `${0.4 + Math.random() * 0.4}s`
          }}
        />
      ))}
    </div>
  );
};

export default AudioVisualizer;