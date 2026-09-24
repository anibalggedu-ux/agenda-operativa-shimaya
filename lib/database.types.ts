export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accesos_sistema: {
        Row: {
          created_at: string
          id: string
          rol: string
          usuario_id: string | null
          usuario_nombre: string
        }
        Insert: {
          created_at?: string
          id?: string
          rol: string
          usuario_id?: string | null
          usuario_nombre: string
        }
        Update: {
          created_at?: string
          id?: string
          rol?: string
          usuario_id?: string | null
          usuario_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "accesos_sistema_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_puntualidad_atendidas: {
        Row: {
          atendido_por_nombre: string
          fecha_referencia: string
          id: string
          tipo: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          atendido_por_nombre: string
          fecha_referencia: string
          id?: string
          tipo: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          atendido_por_nombre?: string
          fecha_referencia?: string
          id?: string
          tipo?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_puntualidad_atendidas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      asignaciones_especiales: {
        Row: {
          created_at: string | null
          fecha_fin: string
          fecha_inicio: string
          id: string
          motivo: string | null
          tipo: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          fecha_fin: string
          fecha_inicio: string
          id?: string
          motivo?: string | null
          tipo: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          motivo?: string | null
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asignaciones_especiales_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      asistencia: {
        Row: {
          fecha: string
          foto_ingreso_blob: string | null
          foto_salida_blob: string | null
          hora_ingreso: string | null
          hora_salida: string | null
          id: string
          ubicacion_ingreso: string | null
          ubicacion_salida: string | null
          usuario_id: string
        }
        Insert: {
          fecha: string
          foto_ingreso_blob?: string | null
          foto_salida_blob?: string | null
          hora_ingreso?: string | null
          hora_salida?: string | null
          id?: string
          ubicacion_ingreso?: string | null
          ubicacion_salida?: string | null
          usuario_id: string
        }
        Update: {
          fecha?: string
          foto_ingreso_blob?: string | null
          foto_salida_blob?: string | null
          hora_ingreso?: string | null
          hora_salida?: string | null
          id?: string
          ubicacion_ingreso?: string | null
          ubicacion_salida?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistencia_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      asistencia_eventos: {
        Row: {
          comunicado_id: string
          created_at: string
          fecha: string
          foto_llegada_blob: string | null
          foto_salida_blob: string | null
          hora_llegada: string | null
          hora_salida: string | null
          id: string
          origen_tienda_id: string | null
          ubicacion_llegada: string | null
          ubicacion_salida: string | null
          usuario_id: string
        }
        Insert: {
          comunicado_id: string
          created_at?: string
          fecha: string
          foto_llegada_blob?: string | null
          foto_salida_blob?: string | null
          hora_llegada?: string | null
          hora_salida?: string | null
          id?: string
          origen_tienda_id?: string | null
          ubicacion_llegada?: string | null
          ubicacion_salida?: string | null
          usuario_id: string
        }
        Update: {
          comunicado_id?: string
          created_at?: string
          fecha?: string
          foto_llegada_blob?: string | null
          foto_salida_blob?: string | null
          hora_llegada?: string | null
          hora_salida?: string | null
          id?: string
          origen_tienda_id?: string | null
          ubicacion_llegada?: string | null
          ubicacion_salida?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistencia_eventos_comunicado_id_fkey"
            columns: ["comunicado_id"]
            isOneToOne: false
            referencedRelation: "comunicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_eventos_origen_tienda_id_fkey"
            columns: ["origen_tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencia_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_cambios: {
        Row: {
          accion: string
          created_at: string
          detalle: string | null
          id: string
          usuario_id: string | null
          usuario_nombre: string
        }
        Insert: {
          accion: string
          created_at?: string
          detalle?: string | null
          id?: string
          usuario_id?: string | null
          usuario_nombre: string
        }
        Update: {
          accion?: string
          created_at?: string
          detalle?: string | null
          id?: string
          usuario_id?: string | null
          usuario_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_cambios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      auditorias: {
        Row: {
          alertas: string[] | null
          clasificacion: string
          compromisos: Json | null
          created_at: string
          fecha: string
          fortalezas: string | null
          id: string
          items: Json
          lider: string | null
          observaciones: Json | null
          oportunidades: string | null
          porcentaje: number
          puntaje_maximo: number
          puntaje_total: number
          supervisor_id: string
          supervisor_nombre: string
          tienda_id: string
        }
        Insert: {
          alertas?: string[] | null
          clasificacion: string
          compromisos?: Json | null
          created_at?: string
          fecha: string
          fortalezas?: string | null
          id?: string
          items: Json
          lider?: string | null
          observaciones?: Json | null
          oportunidades?: string | null
          porcentaje: number
          puntaje_maximo: number
          puntaje_total: number
          supervisor_id: string
          supervisor_nombre: string
          tienda_id: string
        }
        Update: {
          alertas?: string[] | null
          clasificacion?: string
          compromisos?: Json | null
          created_at?: string
          fecha?: string
          fortalezas?: string | null
          id?: string
          items?: Json
          lider?: string | null
          observaciones?: Json | null
          oportunidades?: string | null
          porcentaje?: number
          puntaje_maximo?: number
          puntaje_total?: number
          supervisor_id?: string
          supervisor_nombre?: string
          tienda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditorias_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditorias_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists_visita: {
        Row: {
          clasificacion: string | null
          created_at: string
          fecha: string
          id: string
          leido: boolean | null
          porcentaje: number | null
          respuestas: Json
          rol: string
          tienda_id: string
          usuario_id: string
          usuario_nombre: string
        }
        Insert: {
          clasificacion?: string | null
          created_at?: string
          fecha: string
          id?: string
          leido?: boolean | null
          porcentaje?: number | null
          respuestas: Json
          rol: string
          tienda_id: string
          usuario_id: string
          usuario_nombre: string
        }
        Update: {
          clasificacion?: string | null
          created_at?: string
          fecha?: string
          id?: string
          leido?: boolean | null
          porcentaje?: number | null
          respuestas?: Json
          rol?: string
          tienda_id?: string
          usuario_id?: string
          usuario_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_visita_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_visita_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicados: {
        Row: {
          autor: string | null
          created_at: string | null
          encuesta_anonima: boolean
          encuesta_cierra: string | null
          encuesta_multiple: boolean
          encuesta_opciones: string[] | null
          fecha: string
          fecha_evento: string | null
          id: string
          lat: number | null
          lon: number | null
          mensaje: string
          tipo: string
          ubicacion: string | null
          usuarios_destino: string[] | null
        }
        Insert: {
          autor?: string | null
          created_at?: string | null
          encuesta_anonima?: boolean
          encuesta_cierra?: string | null
          encuesta_multiple?: boolean
          encuesta_opciones?: string[] | null
          fecha?: string
          fecha_evento?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          mensaje: string
          tipo: string
          ubicacion?: string | null
          usuarios_destino?: string[] | null
        }
        Update: {
          autor?: string | null
          created_at?: string | null
          encuesta_anonima?: boolean
          encuesta_cierra?: string | null
          encuesta_multiple?: boolean
          encuesta_opciones?: string[] | null
          fecha?: string
          fecha_evento?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          mensaje?: string
          tipo?: string
          ubicacion?: string | null
          usuarios_destino?: string[] | null
        }
        Relationships: []
      }
      configuracion_bono_historia: {
        Row: {
          activo: boolean
          id: boolean
          puntos: number
        }
        Insert: {
          activo?: boolean
          id?: boolean
          puntos?: number
        }
        Update: {
          activo?: boolean
          id?: boolean
          puntos?: number
        }
        Relationships: []
      }
      intentos_login: {
        Row: {
          created_at: string
          id: number
          ip: string
        }
        Insert: {
          created_at?: string
          id?: number
          ip: string
        }
        Update: {
          created_at?: string
          id?: number
          ip?: string
        }
        Relationships: []
      }
      documentos: {
        Row: {
          actualizado_en: string
          categoria: string
          created_at: string
          extension: string
          id: string
          nombre: string
          ruta_storage: string
          subido_por: string
          tamano_bytes: number
        }
        Insert: {
          actualizado_en?: string
          categoria: string
          created_at?: string
          extension: string
          id?: string
          nombre: string
          ruta_storage: string
          subido_por: string
          tamano_bytes?: number
        }
        Update: {
          actualizado_en?: string
          categoria?: string
          created_at?: string
          extension?: string
          id?: string
          nombre?: string
          ruta_storage?: string
          subido_por?: string
          tamano_bytes?: number
        }
        Relationships: []
      }
      encuesta_respuestas: {
        Row: {
          created_at: string
          encuesta_id: string | null
          id: string
          puntos_ganados: number
          respuestas: Json
          usuario_id: string
        }
        Insert: {
          created_at?: string
          encuesta_id?: string | null
          id?: string
          puntos_ganados?: number
          respuestas: Json
          usuario_id: string
        }
        Update: {
          created_at?: string
          encuesta_id?: string | null
          id?: string
          puntos_ganados?: number
          respuestas?: Json
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "encuesta_respuestas_encuesta_id_fkey"
            columns: ["encuesta_id"]
            isOneToOne: false
            referencedRelation: "encuestas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encuesta_respuestas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      encuesta_votos: {
        Row: {
          comunicado_id: string
          created_at: string
          id: string
          opcion: number
          usuario_id: string
        }
        Insert: {
          comunicado_id: string
          created_at?: string
          id?: string
          opcion: number
          usuario_id: string
        }
        Update: {
          comunicado_id?: string
          created_at?: string
          id?: string
          opcion?: number
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "encuesta_votos_comunicado_id_fkey"
            columns: ["comunicado_id"]
            isOneToOne: false
            referencedRelation: "comunicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encuesta_votos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      encuestas: {
        Row: {
          anonima: boolean
          autor: string | null
          cierra: string | null
          created_at: string
          descripcion: string | null
          id: string
          preguntas: Json
          puntos: number
          titulo: string
          usuarios_destino: string[] | null
        }
        Insert: {
          anonima?: boolean
          autor?: string | null
          cierra?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          preguntas: Json
          puntos?: number
          titulo: string
          usuarios_destino?: string[] | null
        }
        Update: {
          anonima?: boolean
          autor?: string | null
          cierra?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          preguntas?: Json
          puntos?: number
          titulo?: string
          usuarios_destino?: string[] | null
        }
        Relationships: []
      }
      historia_comentarios: {
        Row: {
          created_at: string
          historia_id: string
          id: string
          texto: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          historia_id: string
          id?: string
          texto: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          historia_id?: string
          id?: string
          texto?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historia_comentarios_historia_id_fkey"
            columns: ["historia_id"]
            isOneToOne: false
            referencedRelation: "historias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historia_comentarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historia_publicaciones: {
        Row: {
          fecha: string
          usuario_id: string
        }
        Insert: {
          fecha: string
          usuario_id: string
        }
        Update: {
          fecha?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historia_publicaciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historia_reacciones: {
        Row: {
          created_at: string
          emoji: string
          historia_id: string
          id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          historia_id: string
          id?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          historia_id?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historia_reacciones_historia_id_fkey"
            columns: ["historia_id"]
            isOneToOne: false
            referencedRelation: "historias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historia_reacciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historia_regalos: {
        Row: {
          created_at: string
          historia_id: string | null
          id: string
          puntos: number
          usuario_id_recibe: string
          usuario_id_regala: string
        }
        Insert: {
          created_at?: string
          historia_id?: string | null
          id?: string
          puntos: number
          usuario_id_recibe: string
          usuario_id_regala: string
        }
        Update: {
          created_at?: string
          historia_id?: string | null
          id?: string
          puntos?: number
          usuario_id_recibe?: string
          usuario_id_regala?: string
        }
        Relationships: [
          {
            foreignKeyName: "historia_regalos_historia_id_fkey"
            columns: ["historia_id"]
            isOneToOne: false
            referencedRelation: "historias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historia_regalos_usuario_id_recibe_fkey"
            columns: ["usuario_id_recibe"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historia_regalos_usuario_id_regala_fkey"
            columns: ["usuario_id_regala"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historia_vistas: {
        Row: {
          created_at: string
          historia_id: string
          id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          historia_id: string
          id?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          historia_id?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historia_vistas_historia_id_fkey"
            columns: ["historia_id"]
            isOneToOne: false
            referencedRelation: "historias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historia_vistas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_asignaciones: {
        Row: {
          area: string | null
          created_at: string | null
          enfoque: string | null
          fecha_planificada: string
          id: string
          tienda_id: string
          usuario_id: string
        }
        Insert: {
          area?: string | null
          created_at?: string | null
          enfoque?: string | null
          fecha_planificada: string
          id?: string
          tienda_id: string
          usuario_id: string
        }
        Update: {
          area?: string | null
          created_at?: string | null
          enfoque?: string | null
          fecha_planificada?: string
          id?: string
          tienda_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historial_asignaciones_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_asignaciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historias: {
        Row: {
          created_at: string
          foto_blob: string
          id: string
          texto: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string
          foto_blob: string
          id?: string
          texto?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string
          foto_blob?: string
          id?: string
          texto?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historias_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones_estado: {
        Row: {
          usuario_id: string
          visto_en: string
        }
        Insert: {
          usuario_id: string
          visto_en?: string
        }
        Update: {
          usuario_id?: string
          visto_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_estado_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      plantilla_auditoria_items: {
        Row: {
          categoria: string
          created_at: string
          id: string
          item: string
          orden: number
        }
        Insert: {
          categoria: string
          created_at?: string
          id?: string
          item: string
          orden?: number
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          item?: string
          orden?: number
        }
        Relationships: []
      }
      plantilla_checklist_visita: {
        Row: {
          actualizado_en: string
          id: string
          secciones: Json
        }
        Insert: {
          actualizado_en?: string
          id?: string
          secciones: Json
        }
        Update: {
          actualizado_en?: string
          id?: string
          secciones?: Json
        }
        Relationships: []
      }
      rutas_activas: {
        Row: {
          area: string | null
          autoasignada: boolean
          created_at: string | null
          enfoque: string | null
          fecha_planificada: string
          foto_llegada_blob: string | null
          foto_salida_blob: string | null
          hora_llegada: string | null
          hora_salida: string | null
          id: string
          origen_tienda_id: string | null
          tienda_id: string
          ubicacion_llegada: string | null
          ubicacion_salida: string | null
          usuario_id: string
        }
        Insert: {
          area?: string | null
          autoasignada?: boolean
          created_at?: string | null
          enfoque?: string | null
          fecha_planificada: string
          foto_llegada_blob?: string | null
          foto_salida_blob?: string | null
          hora_llegada?: string | null
          hora_salida?: string | null
          id?: string
          origen_tienda_id?: string | null
          tienda_id: string
          ubicacion_llegada?: string | null
          ubicacion_salida?: string | null
          usuario_id: string
        }
        Update: {
          area?: string | null
          autoasignada?: boolean
          created_at?: string | null
          enfoque?: string | null
          fecha_planificada?: string
          foto_llegada_blob?: string | null
          foto_salida_blob?: string | null
          hora_llegada?: string | null
          hora_salida?: string | null
          id?: string
          origen_tienda_id?: string | null
          tienda_id?: string
          ubicacion_llegada?: string | null
          ubicacion_salida?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rutas_activas_origen_tienda_id_fkey"
            columns: ["origen_tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutas_activas_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutas_activas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      rutas_diarias: {
        Row: {
          actividad: string | null
          asignado_en: string | null
          created_at: string | null
          fecha: string
          foto_llegada_blob: string | null
          foto_salida_blob: string | null
          hora_llegada: string | null
          hora_salida: string | null
          id: string
          leido: boolean | null
          observacion: string | null
          origen_tienda_id: string | null
          respuesta: string | null
          respuesta_fecha: string | null
          respuesta_por: string | null
          rol: string | null
          tienda_id: string
          ubicacion_llegada: string | null
          ubicacion_salida: string | null
          usuario_id: string
        }
        Insert: {
          actividad?: string | null
          asignado_en?: string | null
          created_at?: string | null
          fecha: string
          foto_llegada_blob?: string | null
          foto_salida_blob?: string | null
          hora_llegada?: string | null
          hora_salida?: string | null
          id?: string
          leido?: boolean | null
          observacion?: string | null
          origen_tienda_id?: string | null
          respuesta?: string | null
          respuesta_fecha?: string | null
          respuesta_por?: string | null
          rol?: string | null
          tienda_id: string
          ubicacion_llegada?: string | null
          ubicacion_salida?: string | null
          usuario_id: string
        }
        Update: {
          actividad?: string | null
          asignado_en?: string | null
          created_at?: string | null
          fecha?: string
          foto_llegada_blob?: string | null
          foto_salida_blob?: string | null
          hora_llegada?: string | null
          hora_salida?: string | null
          id?: string
          leido?: boolean | null
          observacion?: string | null
          origen_tienda_id?: string | null
          respuesta?: string | null
          respuesta_fecha?: string | null
          respuesta_por?: string | null
          rol?: string | null
          tienda_id?: string
          ubicacion_llegada?: string | null
          ubicacion_salida?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rutas_diarias_origen_tienda_id_fkey"
            columns: ["origen_tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutas_diarias_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutas_diarias_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_descanso: {
        Row: {
          created_at: string
          dias_actuales: string[] | null
          dias_solicitados: string[]
          estado: string
          fecha_deseada: string | null
          id: string
          motivo: string | null
          respondido_en: string | null
          respondido_por: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string
          dias_actuales?: string[] | null
          dias_solicitados: string[]
          estado?: string
          fecha_deseada?: string | null
          id?: string
          motivo?: string | null
          respondido_en?: string | null
          respondido_por?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string
          dias_actuales?: string[] | null
          dias_solicitados?: string[]
          estado?: string
          fecha_deseada?: string | null
          id?: string
          motivo?: string | null
          respondido_en?: string | null
          respondido_por?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_descanso_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_permiso: {
        Row: {
          created_at: string
          estado: string
          fecha_fin: string
          fecha_inicio: string
          id: string
          motivo: string | null
          respondido_en: string | null
          respondido_por: string | null
          tipo: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha_fin: string
          fecha_inicio: string
          id?: string
          motivo?: string | null
          respondido_en?: string | null
          respondido_por?: string | null
          tipo?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          estado?: string
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          motivo?: string | null
          respondido_en?: string | null
          respondido_por?: string | null
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_permiso_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      tiendas: {
        Row: {
          direccion: string | null
          es_provincia: boolean
          id: string
          lat: number | null
          lon: number | null
          nombre: string
        }
        Insert: {
          direccion?: string | null
          es_provincia?: boolean
          id?: string
          lat?: number | null
          lon?: number | null
          nombre: string
        }
        Update: {
          direccion?: string | null
          es_provincia?: boolean
          id?: string
          lat?: number | null
          lon?: number | null
          nombre?: string
        }
        Relationships: []
      }
      tiendas_permanentes: {
        Row: {
          created_at: string | null
          fecha_fin: string | null
          id: string
          tienda_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          fecha_fin?: string | null
          id?: string
          tienda_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          fecha_fin?: string | null
          id?: string
          tienda_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiendas_permanentes_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiendas_permanentes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          activo: boolean
          clave_hash: string
          created_at: string | null
          dias_descanso: string[] | null
          direccion: string | null
          email: string | null
          fecha_ingreso: string | null
          fecha_nacimiento: string | null
          hora_limite_ingreso: string | null
          horario_por_dia: Json | null
          id: string
          lat: number | null
          lon: number | null
          nombre: string
          puede_auditar: boolean
          puede_registrar: boolean
          puntos_heredados: number
          rol: string
        }
        Insert: {
          activo?: boolean
          clave_hash: string
          created_at?: string | null
          dias_descanso?: string[] | null
          direccion?: string | null
          email?: string | null
          fecha_ingreso?: string | null
          fecha_nacimiento?: string | null
          hora_limite_ingreso?: string | null
          horario_por_dia?: Json | null
          id?: string
          lat?: number | null
          lon?: number | null
          nombre: string
          puede_auditar?: boolean
          puede_registrar?: boolean
          puntos_heredados?: number
          rol: string
        }
        Update: {
          activo?: boolean
          clave_hash?: string
          created_at?: string | null
          dias_descanso?: string[] | null
          direccion?: string | null
          email?: string | null
          fecha_ingreso?: string | null
          fecha_nacimiento?: string | null
          hora_limite_ingreso?: string | null
          horario_por_dia?: Json | null
          id?: string
          lat?: number | null
          lon?: number | null
          nombre?: string
          puede_auditar?: boolean
          puede_registrar?: boolean
          puntos_heredados?: number
          rol?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
