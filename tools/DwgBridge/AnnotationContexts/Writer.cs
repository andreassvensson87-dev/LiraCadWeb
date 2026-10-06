using ACadSharp.Objects;
using System;

namespace ACadSharp.IO.DXF;
internal partial class DxfObjectsSectionWriter
{
    private void writeLiraContextHeader(LiraAnnotationContext context)
    {
        _writer.Write(100, "AcDbObjectContextData");
        _writer.Write(70, context.Version);
        _writer.Write(290, context.Default);
        writeAnnotScaleObjectContextData(context);
        _writer.Write(100, context.SubclassMarker);
    }

    private void writeLiraTextContext(LiraTextObjectContextData context)
    {
        writeLiraContextHeader(context);
        _writer.Write(70, context.HorizontalMode);
        _writer.Write(50, context.Rotation * 180 / Math.PI);
        _writer.Write(10, context.Insertion.X); _writer.Write(20, context.Insertion.Y);
        _writer.Write(11, context.Alignment.X); _writer.Write(21, context.Alignment.Y);
    }

    private void writeLiraMTextContext(LiraMTextObjectContextData context)
    {
        writeLiraContextHeader(context);
        _writer.Write(70, context.Attachment);
        _writer.Write(10, context.Insertion.X); _writer.Write(20, context.Insertion.Y); _writer.Write(30, context.Insertion.Z);
        _writer.Write(11, context.Direction.X); _writer.Write(21, context.Direction.Y); _writer.Write(31, context.Direction.Z);
        _writer.Write(40, context.Width); _writer.Write(41, context.Height);
        _writer.Write(42, context.ExtentsWidth); _writer.Write(43, context.ExtentsHeight);
        _writer.Write(71, context.ColumnType);
        if (context.ColumnType != 0)
        {
            _writer.Write(72, context.ColumnCount);
            _writer.Write(44, context.ColumnWidth); _writer.Write(45, context.Gutter);
            _writer.Write(73, context.AutoHeight); _writer.Write(74, context.Reversed);
            foreach (var height in context.ColumnHeights) _writer.Write(46, height);
        }
    }
    private void writeLiraDimensionContext(LiraDimensionObjectContextData context)
    {
        _writer.Write(100, "AcDbObjectContextData");
        _writer.Write(70, context.Version); _writer.Write(290, context.Default);
        writeAnnotScaleObjectContextData(context);
        _writer.Write(100, "AcDbDimensionObjectContextData");
        _writer.Write(10, context.TextPoint.X); _writer.Write(20, context.TextPoint.Y); _writer.Write(30, 0.0);
        _writer.Write(294, context.UserTextLocation); _writer.Write(140, context.TextRotation * 180 / Math.PI);
        if (context.Block != null) _writer.Write(2, context.Block.Name);
        _writer.Write(293, context.Reserved); _writer.Write(298, context.DimTofl);
        _writer.Write(291, context.DimOsxd); _writer.Write(70, context.DimAtfit);
        _writer.Write(292, context.DimTix); _writer.Write(71, context.DimTmove);
        _writer.Write(280, context.OverrideCode); _writer.Write(295, context.HasArrow2);
        _writer.Write(296, context.FlipArrow2); _writer.Write(297, context.FlipArrow1);
        _writer.Write(100, context.SubclassMarker);
        int pointCode = context.Kind == "RADIMLG" ? 12 : 11;
        _writer.Write(pointCode, context.FirstPoint.X); _writer.Write(pointCode + 10, context.FirstPoint.Y); _writer.Write(pointCode + 20, context.FirstPoint.Z);
        if (context.Kind is "DMDIM" or "RADIMLG" or "ORDDIM") {
            pointCode++;
            _writer.Write(pointCode, context.SecondPoint.X); _writer.Write(pointCode + 10, context.SecondPoint.Y); _writer.Write(pointCode + 20, context.SecondPoint.Z);
        }
    }

}
