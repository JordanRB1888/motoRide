# -*- coding: utf-8 -*-
"""
Compone el arte de relleno de los espacios publicitarios.

    python scripts/arte-de-publicidad.py

QUE SON ESTAS IMAGENES

MARCADORES DE POSICION. Ocupan el sitio de la imagen que suba cada anunciante
desde el panel administrativo, para que la seccion que se vende no se vea como
una rejilla de discos grises con una letra dentro.

NO son fotos de ningun negocio y no lo pretenden: los comercios del fixture se
llaman «de ejemplo».

LA RECETA

La misma ilustracion desenfocada cubriendo el fondo y nitida encima. Rellena
cualquier encuadre sin deformar nada y sin depender de que la ilustracion
tenga la proporcion de la tarjeta. Todas salen de `assets/marca/`, que es lo
que ya usa la aplicacion: asi el relleno tiene el estilo del resto y no parece
prestado de otra parte.

POR QUE UN SCRIPT Y NO IMAGENES SUELTAS

Para poder rehacerlas. Si cambia el encuadre de una tarjeta, o el gris de la
marca, se vuelve a ejecutar esto en vez de recordar como se hicieron.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
MARCA = os.path.join(AQUI, '..', 'assets', 'marca')
SALIDA = os.path.join(MARCA, 'publicidad')
os.makedirs(SALIDA, exist_ok=True)

AMARILLO = (255, 210, 31)
GRAFITO = (11, 10, 9)
HUESO = (250, 249, 246)
CENIZA = (173, 170, 162)


def sobre_fondo(imagen, fondo=GRAFITO):
    """Aplana la transparencia contra el grafito de la aplicacion."""
    if imagen.mode != 'RGBA':
        return imagen.convert('RGB')
    plano = Image.new('RGB', imagen.size, fondo)
    plano.paste(imagen, mask=imagen.split()[3])
    return plano


def cubrir(imagen, ancho, alto):
    """Escala y recorta al centro para llenar el encuadre sin deformar."""
    escala = max(ancho / imagen.width, alto / imagen.height)
    nueva = imagen.resize(
        (max(1, round(imagen.width * escala)), max(1, round(imagen.height * escala))),
        Image.LANCZOS
    )
    izquierda = (nueva.width - ancho) // 2
    arriba = (nueva.height - alto) // 2
    return nueva.crop((izquierda, arriba, izquierda + ancho, arriba + alto))


def portada(origen, destino, ancho=456, alto=180):
    base = sobre_fondo(Image.open(os.path.join(MARCA, origen)))

    lienzo = cubrir(base, ancho, alto).filter(ImageFilter.GaussianBlur(alto / 14))
    # Un velo oscuro: el desenfoque solo no basta para que el texto de la
    # tarjeta, debajo, siga siendo lo primero que se lee.
    lienzo = Image.blend(lienzo, Image.new('RGB', lienzo.size, GRAFITO), 0.42)

    # El centro tiene que llevar contenido: la misma imagen se recorta luego a
    # cuadrado para las miniaturas de la lista, y un centro vacio deja una
    # mancha negra donde deberia haber un anuncio.
    lado = round(alto * 0.86)
    lienzo.paste(cubrir(base, lado, lado), ((ancho - lado) // 2, (alto - lado) // 2))

    pincel = ImageDraw.Draw(lienzo)
    pincel.rectangle([0, alto - 3, ancho, alto], fill=AMARILLO)

    ruta = os.path.join(SALIDA, destino)
    lienzo.save(ruta, 'JPEG', quality=80, optimize=True)
    return os.path.getsize(ruta)


def tipografia(tamano, negrita=True):
    for nombre in (['segoeuib.ttf', 'arialbd.ttf'] if negrita else ['segoeui.ttf', 'arial.ttf']):
        ruta = os.path.join(r'C:\Windows\Fonts', nombre)
        if os.path.exists(ruta):
            return ImageFont.truetype(ruta, tamano)
    return ImageFont.load_default()


def banner(origen, destino, rotulo, titulo, pie):
    """Un banner de campana: la imagen trae su propio texto dentro."""
    ancho, alto = 600, 338
    base = sobre_fondo(Image.open(os.path.join(MARCA, origen)))

    lienzo = cubrir(base, ancho, alto).filter(ImageFilter.GaussianBlur(20))
    lienzo = Image.blend(lienzo, Image.new('RGB', lienzo.size, GRAFITO), 0.55)

    lado = round(alto * 0.92)
    lienzo.paste(cubrir(base, lado, lado), (ancho - lado + 26, (alto - lado) // 2))

    # Un degradado hacia la izquierda para que el texto tenga fondo limpio.
    velo = Image.new('L', (ancho, alto), 0)
    pincelVelo = ImageDraw.Draw(velo)
    for x in range(ancho):
        pincelVelo.line([(x, 0), (x, alto)], fill=max(0, int(235 - x * 0.62)))
    lienzo = Image.composite(Image.new('RGB', lienzo.size, GRAFITO), lienzo, velo)

    pincel = ImageDraw.Draw(lienzo)
    pincel.rectangle([0, 0, 6, alto], fill=AMARILLO)
    pincel.text((38, 54), rotulo, font=tipografia(20), fill=AMARILLO)
    pincel.text((38, 92), titulo, font=tipografia(44), fill=HUESO)
    pincel.text((38, 158), pie, font=tipografia(22, negrita=False), fill=CENIZA)
    pincel.text((38, 246), '+58express', font=tipografia(24), fill=AMARILLO)

    ruta = os.path.join(SALIDA, destino)
    lienzo.save(ruta, 'JPEG', quality=82, optimize=True)
    return os.path.getsize(ruta)


# Cada aliado con la ilustracion mas cercana a lo que vende. Donde no hay una
# exacta se usa la que mas se le parece: es relleno, y el dueno lo sustituye.
#
# Repuestos lleva la moto de marca y no la foto de la campana de Moter: esa
# foto trae su propio texto dentro y recortada deja palabras a medias.
PORTADAS = [
    ('servicio-comida.png', 'aliado-comida.jpg'),
    ('servicio-comercios.png', 'aliado-salud.jpg'),
    ('moto.png', 'aliado-moto.jpg'),
    ('servicio-mercado.png', 'aliado-mercado.jpg'),
    ('servicio-compra-vende.png', 'aliado-panaderia.jpg')
]

if __name__ == '__main__':
    total = 0
    for origen, destino in PORTADAS:
        peso = portada(origen, destino)
        total += peso
        print('%-26s %6d B' % (destino, peso))

    peso = banner(
        'servicio-transporte-seguro.png',
        'campana-aviso.jpg',
        'AVISO',
        'Espacio de aviso',
        'Para lo que haga falta contar ese d\u00eda.'
    )
    total += peso
    print('%-26s %6d B' % ('campana-aviso.jpg', peso))
    print('total %.1f KB' % (total / 1024))
