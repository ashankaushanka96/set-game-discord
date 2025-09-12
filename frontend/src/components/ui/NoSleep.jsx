import { useEffect, useRef } from 'react';

export default function NoSleep({ isActive, children }) {
  const videoRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      // Clean up when not active
      if (videoRef.current) {
        videoRef.current.pause();
        if (videoRef.current.parentNode) {
          videoRef.current.parentNode.removeChild(videoRef.current);
        }
        videoRef.current = null;
      }
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Create a hidden video element that plays continuously
    const createNoSleepVideo = () => {
      const video = document.createElement('video');
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('loop', '');
      video.setAttribute('autoplay', '');
      video.style.position = 'fixed';
      video.style.top = '-1px';
      video.style.left = '-1px';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      video.style.zIndex = '-1';

      // Create a minimal video stream using canvas
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const ctx = canvas.getContext('2d');
      
      // Create a simple animation
      let frame = 0;
      const drawFrame = () => {
        ctx.fillStyle = frame % 2 === 0 ? '#000000' : '#000001';
        ctx.fillRect(0, 0, 2, 2);
        frame++;
      };

      // Create video stream
      const stream = canvas.captureStream(1); // 1 FPS is enough
      video.srcObject = stream;
      
      // Start drawing frames
      const drawInterval = setInterval(drawFrame, 1000);
      
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(console.error);
      });

      document.body.appendChild(video);
      videoRef.current = video;

      // Clean up draw interval when video is removed
      const originalRemove = video.remove;
      video.remove = function() {
        clearInterval(drawInterval);
        originalRemove.call(this);
      };

      console.log('No-sleep video created');
    };

    // Fallback: Periodic activity
    const startActivity = () => {
      intervalRef.current = setInterval(() => {
        if (document.hidden) return;
        
        // Simulate user interaction
        const event = new Event('mousemove', { bubbles: true });
        document.dispatchEvent(event);
        
        // Update page title briefly
        const title = document.title;
        document.title = title + ' ';
        setTimeout(() => {
          document.title = title;
        }, 1);
      }, 20000); // Every 20 seconds
    };

    createNoSleepVideo();
    startActivity();

    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        if (videoRef.current.parentNode) {
          videoRef.current.parentNode.removeChild(videoRef.current);
        }
        videoRef.current = null;
      }
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);

  return children;
}

