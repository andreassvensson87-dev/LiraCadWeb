using ACadSharp.Attributes;
using ACadSharp.Classes;
using CSMath;

namespace ACadSharp.Objects;

// These objects belong to an entity's ACDB_ANNOTATIONSCALES dictionary.
// Keep scale handles and the default representation intact during DWG → DXF.
public abstract class LiraAnnotationContext : AnnotScaleObjectContextData, IDxfClassDefined
{
    public DxfClass GetDxfClass() => new DxfClass {
        CppClassName = SubclassMarker, DxfName = ObjectName,
        DwgVersion = ACadVersion.AC1021, ItemClassId = 499,
        ProxyFlags = ProxyFlags.EraseAllowed | ProxyFlags.CloningAllowed | ProxyFlags.DisablesProxyWarningDialog
    };
}

[DxfName("ACDB_TEXTOBJECTCONTEXTDATA_CLASS")]
[DxfSubClass("AcDbTextObjectContextData")]
public class LiraTextObjectContextData : LiraAnnotationContext
{
    public override string ObjectName => "ACDB_TEXTOBJECTCONTEXTDATA_CLASS";
    public override string SubclassMarker => "AcDbTextObjectContextData";
    public short HorizontalMode { get; set; }
    public double Rotation { get; set; }
    public XY Insertion { get; set; }
    public XY Alignment { get; set; }
}

[DxfName("ACDB_MTEXTOBJECTCONTEXTDATA_CLASS")]
[DxfSubClass("AcDbMTextObjectContextData")]
public class LiraMTextObjectContextData : LiraAnnotationContext
{
    public override string ObjectName => "ACDB_MTEXTOBJECTCONTEXTDATA_CLASS";
    public override string SubclassMarker => "AcDbMTextObjectContextData";
    public int Attachment { get; set; }
    public XYZ Direction { get; set; }
    public XYZ Insertion { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
    public double ExtentsWidth { get; set; }
    public double ExtentsHeight { get; set; }
    public int ColumnType { get; set; }
    public int ColumnCount { get; set; }
    public double ColumnWidth { get; set; }
    public double Gutter { get; set; }
    public bool AutoHeight { get; set; }
    public bool Reversed { get; set; }
    public double[] ColumnHeights { get; set; } = [];
}
