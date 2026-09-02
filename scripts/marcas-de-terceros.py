# -*- coding: utf-8 -*-
"""Dibuja los glifos de Google y Apple para los botones de entrada.

QUE SON ESTOS ARCHIVOS

Los botones «entrar con Google» y «entrar con Apple» solo ensenan el logotipo
de cada empresa, sin texto: es lo que pidio el dueno y lo que hacen las dos
guias de marca cuando el boton es un icono.

Google y Apple ENTREGAN sus propios archivos y exigen usarlos —proporciones,
colores y area de respeto—. Aqui no hay red, asi que estos dos se dibujan con
las formas y los colores oficiales para que la pantalla se pueda ver y probar.

  ANTES DE PUBLICAR EN LAS TIENDAS HAY QUE SUSTITUIRLOS por los archivos
  oficiales: la «G» de Google Identity y el glifo de «Sign in with Apple».

Mientras tanto los botones estan DESHABILITADOS —no hay autenticacion social
real detras—, asi que nadie puede llegar a un flujo de Google o de Apple con
un logotipo que no es el suyo.

COMO SE DIBUJAN

A 8x y luego se reducen: PIL no suaviza los bordes de arco ni de elipse, y a
tamano final los dientes de sierra se ven. La manzana sale en negro con alfa
y la aplicacion la tine segun el esquema —negro de dia, blanco de noche—, que
es justo lo que pide la guia de Apple.
"""
import io
import os

from PIL import Image, ImageDraw

SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      '..', 'mobile', 'assets', 'marca', 'terceros')
LADO = 192
ESCALA = 8

# Los colores oficiales de la G.
ROJO = (234, 67, 53, 255)
AMARILLO = (251, 188, 5, 255)
VERDE = (52, 168, 83, 255)
AZUL = (66, 133, 244, 255)


def lienzo():
    return Image.new('RGBA', (LADO * ESCALA, LADO * ESCALA), (0, 0, 0, 0))


def guardar(imagen, nombre):
    if not os.path.isdir(SALIDA):
        os.makedirs(SALIDA)
    reducida = imagen.resize((LADO, LADO), Image.LANCZOS)
    ruta = os.path.join(SALIDA, nombre)
    reducida.save(ruta, 'PNG', optimize=True)
    print('%s: %d bytes' % (nombre, os.path.getsize(ruta)))


def google():
    """La «G»: cuatro arcos y la barra azul que entra desde el centro.

    Los angulos de PIL empiezan a las 3 en punto y crecen en sentido horario,
    porque la y va hacia abajo. Asi que 270 es arriba y 90 es abajo.

    El anillo se interrumpe entre las 3 y las 4 y media: ahi es donde termina
    el verde y sale la barra.
    """
    imagen = lienzo()
    dibujo = ImageDraw.Draw(imagen)

    # Las proporciones del original: el circulo ocupa el 92% del cuadro y el
    # trazo es el 22% de su diametro, que deja el hueco interior en algo mas
    # de la mitad del radio. Con el trazo mas gordo la letra se lee como una
    # «e», que es justo lo que pasaba con la primera version.
    centro = LADO * ESCALA / 2
    lado = LADO * ESCALA
    grosor = lado * 0.207
    radio = lado * 0.46 - grosor / 2  # radio de la LINEA MEDIA del trazo
    caja = [centro - radio, centro - radio, centro + radio, centro + radio]

    for desde, hasta, color in (
        # El azul baja por la derecha y pasa algo del eje: con el arco parado
        # en las 3 en punto, el travesano asomaba por fuera como un bloque. En
        # el original el azul es UNA pieza en «L», arco y travesano juntos.
        (305, 16, AZUL),
        (215, 305, ROJO),     # arriba
        (145, 215, AMARILLO), # izquierda
        (62, 145, VERDE)     # abajo
    ):
        dibujo.arc(caja, desde, hasta, fill=color, width=int(grosor))

    # La barra: del centro al borde derecho, a media altura. Su grosor es el
    # del anillo, y su borde superior queda alineado con el eje.
    # Hasta la linea media del trazo, no hasta el borde exterior: el arco ya
    # pone el remate redondeado por fuera.
    dibujo.rectangle(
        [centro - grosor * 0.05, centro + grosor * 0.06,
         centro + radio, centro + grosor * 0.97],
        fill=AZUL
    )

    guardar(imagen, 'google.png')


def bezier(puntos, pasos=220):
    """Una cubica, punto a punto. PIL no dibuja curvas, asi que se muestrean."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = puntos
    salida = []
    for i in range(pasos + 1):
        t = i / pasos
        u = 1 - t
        salida.append((
            u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
        ))
    return salida


def apple():
    """La manzana mordida, con su hoja.

    El cuerpo son dos lobulos que se juntan; arriba, en el centro, la hendidura
    entre los dos; a la derecha, el mordisco. Todo en negro con alfa: el color
    lo pone la aplicacion segun el esquema.
    """
    imagen = lienzo()
    dibujo = ImageDraw.Draw(imagen)
    u = LADO * ESCALA / 100.0  # una centesima del lado, para escribir en proporciones
    negro = (0, 0, 0, 255)

    # Los dos lobulos del cuerpo. Solapan en el centro, asi que se leen como
    # una sola pieza con la cintura ancha y la base redondeada.
    dibujo.ellipse([12 * u, 30 * u, 62 * u, 92 * u], fill=negro)
    dibujo.ellipse([38 * u, 30 * u, 88 * u, 92 * u], fill=negro)
    dibujo.rectangle([30 * u, 40 * u, 70 * u, 80 * u], fill=negro)
    # Los hombros: la manzana es mas ancha arriba que una elipse pura.
    dibujo.ellipse([16 * u, 26 * u, 56 * u, 70 * u], fill=negro)
    dibujo.ellipse([44 * u, 26 * u, 84 * u, 70 * u], fill=negro)

    # La hendidura de arriba, entre los dos lobulos. Estrecha: es donde se
    # apoya la hoja, no un valle.
    dibujo.ellipse([40 * u, 13 * u, 60 * u, 35 * u], fill=(0, 0, 0, 0))

    # El mordisco: un circulo vacio a la derecha, a la altura del hombro.
    dibujo.ellipse([72 * u, 32 * u, 100 * u, 60 * u], fill=(0, 0, 0, 0))

    # La hoja: dos curvas que se cierran, inclinada hacia la derecha y
    # APOYADA en la hendidura. Separada del cuerpo parecia otra cosa.
    hoja = bezier([(51 * u, 26 * u), (54 * u, 12 * u), (64 * u, 6 * u), (70 * u, 6 * u)])
    hoja += bezier([(70 * u, 6 * u), (70 * u, 15 * u), (63 * u, 25 * u), (51 * u, 26 * u)])
    dibujo.polygon(hoja, fill=negro)

    guardar(imagen, 'apple.png')


google()
apple()
print('listo:', os.path.normpath(SALIDA))
