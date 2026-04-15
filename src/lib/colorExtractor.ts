export const getAverageColor = (imgSrc: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imgSrc;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject('Could not get canvas context');
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      let data;
      try {
        data = ctx.getImageData(0, 0, img.width, img.height).data;
      } catch (e) {
        reject(e);
        return;
      }

      let r = 0, g = 0, b = 0;
      const blockSize = 5; // only visit every 5 pixels
      let count = 0;

      for (let i = 0; i < data.length; i += 4 * blockSize) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }

      r = Math.floor(r / count);
      g = Math.floor(g / count);
      b = Math.floor(b / count);

      resolve(`rgb(${r}, ${g}, ${b})`);
    };

    img.onerror = (err) => {
      reject(err);
    };
  });
};