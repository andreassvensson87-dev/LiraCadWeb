using ACadSharp.Attributes;
using ACadSharp.Tables;
using ACadSharp.IO.Templates;
using CSMath;

namespace ACadSharp.Objects
{
    [DxfSubClass("AcDbDimensionObjectContextData")]
    public class LiraDimensionObjectContextData : LiraAnnotationContext
    {
        public string Kind { get; }
        public LiraDimensionObjectContextData(string kind) { Kind = kind; }
        public override string ObjectName => "ACDB_" + Kind + "OBJECTCONTEXTDATA_CLASS";
        public override string SubclassMarker => Kind switch {
            "ALDIM" => "AcDbAlignedDimensionObjectContextData",
            "ANGDIM" => "AcDbAngularDimensionObjectContextData",
            "DMDIM" => "AcDbDiametricDimensionObjectContextData",
            "RADIM" => "AcDbRadialDimensionObjectContextData",
            "RADIMLG" => "AcDbRadialDimensionLargeObjectContextData",
            _ => "AcDbOrdinateDimensionObjectContextData"
        };
        public XY TextPoint { get; set; }
        public bool UserTextLocation { get; set; }
        public double TextRotation { get; set; }
        public bool Reserved { get; set; }
        public bool DimTofl { get; set; }
        public bool DimOsxd { get; set; }
        public bool DimAtfit { get; set; }
        public bool DimTix { get; set; }
        public bool DimTmove { get; set; }
        public byte OverrideCode { get; set; }
        public bool HasArrow2 { get; set; }
        public bool FlipArrow2 { get; set; }
        public bool FlipArrow1 { get; set; }
        public XYZ FirstPoint { get; set; }
        public XYZ SecondPoint { get; set; }
        public BlockRecord Block { get; set; }
    }
}
namespace ACadSharp.IO.Templates
{
    internal class LiraDimensionContextTemplate : CadAnnotScaleObjectContextDataTemplate
    {
        public ulong? BlockHandle { get; set; }
        public LiraDimensionContextTemplate(ACadSharp.Objects.LiraDimensionObjectContextData context) : base(context) { }
        protected override void build(CadDocumentBuilder builder)
        {
            base.build(builder);
            if (builder.TryGetCadObject(BlockHandle, out BlockRecord block))
                ((ACadSharp.Objects.LiraDimensionObjectContextData)CadObject).Block = block;
        }
    }
}
