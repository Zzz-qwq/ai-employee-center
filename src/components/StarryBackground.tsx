import { useRef, useEffect } from 'react';

interface Star {
  x: number;
  y: number;
  r: number;
  opacity: number;
  phase: number;
  speed: number;
  glow?: boolean;
}

export default function StarryBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let stars: Star[] = [];
    let animationId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      width = canvas.clientWidth * (window.devicePixelRatio || 1);
      height = canvas.clientHeight * (window.devicePixelRatio || 1);
      canvas.width = width;
      canvas.height = height;
      initStars();
    };

    const initStars = () => {
      const count = Math.floor((width * height) / 4500); // ~200 at 1200x700
      stars = [];
      for (let i = 0; i < count; i++) {
        const isGlow = Math.random() < 0.08; // 8% glow stars
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: isGlow ? 1.2 + Math.random() * 1.8 : 0.3 + Math.random() * 1.0,
          opacity: 0.3 + Math.random() * 0.7,
          phase: Math.random() * Math.PI * 2,
          speed: 0.005 + Math.random() * 0.025,
          glow: isGlow,
        });
      }
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      // Dark gradient background
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#0a0e1a');
      bg.addColorStop(0.5, '#111b33');
      bg.addColorStop(1, '#1a2744');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Subtle nebula blobs
      const nebula1 = ctx.createRadialGradient(width * 0.3, height * 0.3, 0, width * 0.3, height * 0.3, width * 0.5);
      nebula1.addColorStop(0, 'rgba(79, 124, 255, 0.06)');
      nebula1.addColorStop(1, 'transparent');
      ctx.fillStyle = nebula1;
      ctx.fillRect(0, 0, width, height);

      const nebula2 = ctx.createRadialGradient(width * 0.7, height * 0.5, 0, width * 0.7, height * 0.5, width * 0.4);
      nebula2.addColorStop(0, 'rgba(30, 42, 90, 0.08)');
      nebula2.addColorStop(1, 'transparent');
      ctx.fillStyle = nebula2;
      ctx.fillRect(0, 0, width, height);

      // Stars
      for (const s of stars) {
        const twinkle = Math.sin(time * s.speed + s.phase);
        const alpha = s.opacity * (0.5 + 0.5 * twinkle);

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.fill();

        // Glow for bright stars
        if (s.glow && twinkle > 0.5) {
          const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
          glow.addColorStop(0, `rgba(180,200,255,${(alpha * 0.5).toFixed(2)})`);
          glow.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }
      }

      // Subtle scan line at bottom
      const scanY = height * 0.85 + Math.sin(time * 0.0003) * height * 0.08;
      const scan = ctx.createLinearGradient(0, scanY - 2, 0, scanY + 2);
      scan.addColorStop(0, 'transparent');
      scan.addColorStop(0.5, 'rgba(79,124,255,0.08)');
      scan.addColorStop(1, 'transparent');
      ctx.fillStyle = scan;
      ctx.fillRect(0, scanY - 2, width, 4);

      // Bottom fade to blend into next section
      const fade = ctx.createLinearGradient(0, height * 0.85, 0, height);
      fade.addColorStop(0, 'transparent');
      fade.addColorStop(1, '#f6f8fc');
      ctx.fillStyle = fade;
      ctx.fillRect(0, height * 0.85, width, height * 0.15);

      animationId = requestAnimationFrame(draw);
    };

    resize();
    animationId = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
