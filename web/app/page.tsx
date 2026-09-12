import SmoothScroll from "@/components/motion/SmoothScroll";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import Hero from "@/components/home/Hero";
import RideScene from "@/components/home/RideScene";
import Servicios from "@/components/home/Servicios";
import DosLados from "@/components/home/DosLados";
import Zonas from "@/components/home/Zonas";
import Seguridad from "@/components/home/Seguridad";
import Descarga from "@/components/home/Descarga";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Navbar />
      <main id="contenido">
        <Hero />
        <RideScene />
        <Servicios />
        <DosLados />
        <Zonas />
        <Seguridad />
        <Descarga />
      </main>
      <Footer />
    </>
  );
}
