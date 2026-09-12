import SmoothScroll from "@/components/motion/SmoothScroll";
import Navbar from "@/components/site/Navbar";
import Hero from "@/components/home/Hero";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Navbar />
      <main id="contenido">
        <Hero />
      </main>
    </>
  );
}
