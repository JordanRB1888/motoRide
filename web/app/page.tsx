import SmoothScroll from "@/components/motion/SmoothScroll";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";
import Hero from "@/components/home/Hero";
import RideScene from "@/components/home/RideScene";
import Servicios from "@/components/home/Servicios";
import DosLados from "@/components/home/DosLados";
import Cobertura from "@/components/home/Cobertura";
import Seguridad from "@/components/home/Seguridad";
import Descarga from "@/components/home/Descarga";
import PromoPrimerViaje from "@/components/home/PromoPrimerViaje";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Navbar />
      <main id="contenido" tabIndex={-1}>
        <Hero />
        <PromoPrimerViaje />
        <RideScene />
        <Servicios />
        <DosLados />
        <Cobertura />
        <Seguridad />
        <Descarga />
      </main>
      <Footer />
    </>
  );
}
