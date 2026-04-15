import { useEffect, useRef } from 'react';

export function WaveParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    const particles: { x: number, y: number, angle: number, speed: number, radius: number, color: string, offset: number }[] = [];
    const numParticles = 150;
    
    const colors = ['#818cf8', '#c084fc', '#e879f9', '#f472b6', '#ffffff'];

    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        angle: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
        radius: 1 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        offset: Math.random() * 100
      });
    }

    let time = 0;

    const render = () => {
      time += 0.01;
      
      // Clear with slight fade for trail effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;

      particles.forEach((p, i) => {
        // Complex mathematical trajectory (Lissajous-like with noise)
        const noiseX = Math.sin(time * 2 + p.offset) * 50;
        const noiseY = Math.cos(time * 1.5 + p.offset) * 50;
        
        // Swirl towards center but maintain an orbit
        const dx = centerX - p.x;
        const dy = centerY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const force = Math.max(0.1, 1000 / (dist * dist + 100)); // Attraction to center
        
        p.angle += 0.02 + (i % 2 === 0 ? 0.01 : -0.01);
        
        // Base circular motion + attraction + noise
        p.x += Math.cos(p.angle) * p.speed + dx * force * 0.01 + Math.sin(time + p.offset) * 0.5;
        p.y += Math.sin(p.angle) * p.speed + dy * force * 0.01 + Math.cos(time + p.offset) * 0.5;

        // Wrap around
        if (p.x < -50) p.x = width + 50;
        if (p.x > width + 50) p.x = -50;
        if (p.y < -50) p.y = height + 50;
        if (p.y > height + 50) p.y = -50;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        
        // Add glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none opacity-60 mix-blend-screen"
    />
  );
}
