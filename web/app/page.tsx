import SmoothScroll from "@/components/motion/SmoothScroll";
import Navbar from "@/components/site/Navbar";
import Hero from "@/components/home/Hero";
import Zonas from "@/components/home/Zonas";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Navbar />
      <main id="contenido">
        <Hero />
        <Zonas />
      </main>
    </>
  );
}
